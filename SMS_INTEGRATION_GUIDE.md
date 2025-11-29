# SMS SIMULATION INTEGRATION GUIDE

## What I've Built for You

Instead of separate HTML files, I've created a **unified SMS simulator** that:

✅ Looks like a real iPhone with animated messages
✅ Shows different message types (check-in, notified, released)
✅ Logs all messages with timestamps
✅ Provides an SMS log viewer for operators
✅ Ready to swap for real SMS API later

---

## Files Created

1. **sms_simulator.html** - The phone simulation popup
2. **sms_log.html** - Message history viewer
3. **This guide** - Integration instructions

---

## Integration Steps

### FOR INDEX.HTML (Main Dashboard)

**CHUNK A12 - submitVehicle() function**

Replace the QR screen line with:
```javascript
// OLD:
window.open(`qr-screen.html?uid=${vehicleId}`, "_blank");

// NEW:
const pager = document.getElementById('pagerInput').value.trim();
const quoted = document.getElementById('quotedInput').value;

// Open QR screen
window.open(`qr-screen.html?uid=${vehicleId}`, "_blank");

// Open SMS simulator
window.open(`sms_simulator.html?type=check_in&phone=${pager}&po=${po}&quoted=${quoted}`, 
    "_blank", 
    "width=400,height=700");
```

**CHUNK A12 - notify() function**

Add after the actions_log insert:
```javascript
async function notify(id) {
    const operator = localStorage.getItem('operator_id') || null;
    const now = new Date().toISOString();
    const { error } = await db.from('vehicles').update({ status: 'notified', notify_time: now }).eq('id', id);
    if (!error) {
        await db.from('actions_log').insert({ vehicle_id: id, action: 'notified', timestamp: now, operator_id: operator });
        
        // ADD THIS - Get vehicle details for SMS
        const { data: vehicle } = await db.from('vehicles').select('po_ref, pager_number, mobile_number').eq('id', id).single();
        const phone = vehicle?.mobile_number || vehicle?.pager_number || 'N/A';
        const po = vehicle?.po_ref || 'N/A';
        
        window.open(`sms_simulator.html?type=notified&phone=${phone}&po=${po}`, 
            "_blank", 
            "width=400,height=700");
        
        await fetchVehicles();
        await fetchLogs();
    }
}
```

**CHUNK A12 - release() function (OPTIONAL)**

If you want to simulate a "departure confirmation" SMS:
```javascript
async function release(id) {
    const operator = localStorage.getItem('operator_id') || null;
    const now = new Date().toISOString();
    
    // Get vehicle for duration calculation
    const { data: vehicle } = await db.from('vehicles').select('*').eq('id', id).single();
    
    const { error } = await db.from('vehicles').update({ status: 'released', release_time: now }).eq('id', id);
    if (!error) {
        await db.from('actions_log').insert({ vehicle_id: id, action: 'released', timestamp: now, operator_id: operator });
        
        // Calculate duration
        const checkIn = new Date(vehicle.check_in_time);
        const duration = Math.floor((new Date(now) - checkIn) / 60000);
        const phone = vehicle?.mobile_number || vehicle?.pager_number || 'N/A';
        const po = vehicle?.po_ref || 'N/A';
        
        window.open(`sms_simulator.html?type=released&phone=${phone}&po=${po}&duration=${duration} mins`, 
            "_blank", 
            "width=400,height=700");
        
        await fetchVehicles();
        await fetchLogs();
    }
}
```

---

### FOR REFERENCE_INDEX.HTML (Legacy Dashboard)

**CHUNK C3 - submitVehicle() function**

Add after QR screen opens:
```javascript
window.open(`qr-screen.html?uid=${vehicleId}`, "_blank");

// ADD THIS:
window.open(`sms_simulator.html?type=check_in&phone=${pager}&po=${po}&quoted=${quoted}`, 
    "_blank", 
    "width=400,height=700");
```

**CHUNK C7 - notifyVehicle() function**

Add after actions_log insert:
```javascript
// Get vehicle details
const { data: v } = await db.from('vehicles').select('po_ref, mobile_number, pager_number').eq('id', id).single();
const phone = v?.mobile_number || v?.pager_number || 'N/A';
const po = v?.po_ref || 'N/A';

window.open(`sms_simulator.html?type=notified&phone=${phone}&po=${po}`, 
    "_blank", 
    "width=400,height=700");
```

---

## Adding SMS Log to Dashboard

**Option 1: Header Button (Recommended)**

Add to the header-right section:
```html
<button onclick="window.open('sms_log.html', '_blank', 'width=400,height=700')" 
        style="padding:8px 16px;font-size:14px;background:#0ea5e9;color:#fff;border:none;border-radius:4px;">
    📱 SMS Log
</button>
```

**Option 2: Activity Feed Integration**

You could show recent SMS in the activity feed by reading from localStorage.

---

## Benefits of This Approach

1. **Single Component** - One file handles all message types
2. **Parameter-Based** - Pass data via URL params (future API-ready)
3. **Logged History** - All messages stored in localStorage
4. **Professional Look** - Realistic iPhone UI builds trust
5. **Easy to Replace** - When you get real SMS API, just swap the window.open() calls

---

## Future: Real SMS Integration

When ready for actual SMS (Twilio, AWS SNS, etc.):

Replace:
```javascript
window.open('sms_simulator.html?type=check_in&...', '_blank', 'width=400,height=700');
```

With:
```javascript
await sendRealSMS({
    to: phone,
    message: getMessage('check_in', { po, quoted }),
    vehicleId: id
});
```

The logging and UI patterns stay the same!

---

## Testing

1. Add a vehicle → Check-in SMS popup appears
2. Click Notify → Notification SMS popup appears  
3. Click "SMS Log" button → See all sent messages
4. Check localStorage key 'sms_log' → See structured data

---

## Questions?

- Want to add SMS to release/completion?
- Want SMS log visible in dashboard instead of popup?
- Want to simulate delivery delays/failures?
- Want to add driver reply simulation?

Let me know and I'll adjust!
