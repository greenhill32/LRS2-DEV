// ============================================================================
// SMS LOGGING HELPER FUNCTIONS
// ============================================================================
// Add these functions to your JavaScript code to log SMS in actions_log
// ============================================================================

/**
 * Log an SMS event to actions_log with all details
 * 
 * @param {string} vehicleId - UUID of the vehicle
 * @param {string} messageType - 'check_in', 'notified', 'released'
 * @param {string} phone - Recipient phone number
 * @param {string} messageContent - The actual SMS text
 * @param {boolean} sent - Whether the SMS was successfully sent (default: true for simulation)
 */
async function logSMS(vehicleId, messageType, phone, messageContent, sent = true) {
    const operatorId = localStorage.getItem('operator_id');
    
    try {
        const { error } = await db.from('actions_log').insert({
            vehicle_id: vehicleId,
            operator_id: operatorId,
            action: messageType, // e.g., 'check_in', 'notified'
            timestamp: new Date().toISOString(),
            recipient_phone: phone,
            message_type: messageType,
            message_sent: sent,
            message_content: messageContent,
            details: {
                sms_simulated: true, // Flag to indicate this is simulated
                sent_via: 'simulator'
            }
        });
        
        if (error) {
            console.error('Failed to log SMS:', error);
        }
    } catch (err) {
        console.error('SMS logging error:', err);
    }
}

/**
 * Generate message content based on type and vehicle data
 */
function generateMessageContent(type, data) {
    const templates = {
        check_in: `Welcome to DCS! You have been successfully checked in at the Gatehouse. Your mobile number: ${data.phone}. Please keep your phone nearby — we will contact you when it's time to proceed. Reference: ${data.po}. Estimated wait: ${data.quoted} minutes. Thank you for your patience.`,
        
        notified: `ACTION REQUIRED - Please proceed immediately to the loading area. Bay Assignment: TBC on arrival. Ensure your paperwork is ready and follow instructions from Goods-Out staff. Reference: ${data.po}. Thank you.`,
        
        released: `Loading Complete - You may now proceed to the gatehouse exit. Please ensure you have all documentation before leaving. Reference: ${data.po}. Total time on site: ${data.duration}. Safe travels!`
    };
    
    return templates[type] || 'System notification';
}

// ============================================================================
// UPDATED FUNCTIONS FOR INDEX.HTML (Chunk A12)
// ============================================================================

/**
 * UPDATED: submitVehicle() - Now logs SMS to database
 */
async function submitVehicle() {
    // ... your existing code up to the vehicle insert ...
    
    const { data, error } = await db.from('vehicles').insert({
        registration: reg,
        po_ref: po,
        pager_number: pager,
        notes: notes,
        quoted_minutes: quoted,
        check_in_time: now,
        due_time: due,
        status: 'parked',
        operator_id: opId,
        classification: prebookExportFlag ? 'export' : 'normal'
    }).select();
    
    if (error) {
        alert('Error: ' + error.message);
        return;
    }
    
    const vehicleId = data[0].id;
    
    // Log the check-in action (existing)
    await db.from('actions_log').insert({
        vehicle_id: vehicleId,
        action: 'check_in',
        timestamp: now,
        operator_id: opId
    });
    
    // NEW: Generate and log SMS
    const phone = pager || 'N/A';
    const messageContent = generateMessageContent('check_in', {
        phone: phone,
        po: po,
        quoted: quoted
    });
    
    await logSMS(vehicleId, 'check_in', phone, messageContent);
    
    // Open QR screen
    window.open(`qr-screen.html?uid=${vehicleId}`, "_blank");
    
    // Open SMS simulator
    window.open(`sms_simulator.html?type=check_in&phone=${phone}&po=${po}&quoted=${quoted}`, 
        "_blank", 
        "width=400,height=700");
    
    // ... rest of your existing code ...
}

/**
 * UPDATED: notify() - Now logs SMS to database
 */
async function notify(id) {
    const operator = localStorage.getItem('operator_id') || null;
    const now = new Date().toISOString();
    
    const { error } = await db.from('vehicles').update({ 
        status: 'notified', 
        notify_time: now 
    }).eq('id', id);
    
    if (!error) {
        // Get vehicle details
        const { data: vehicle } = await db
            .from('vehicles')
            .select('po_ref, pager_number, mobile_number')
            .eq('id', id)
            .single();
        
        const phone = vehicle?.mobile_number || vehicle?.pager_number || 'N/A';
        const po = vehicle?.po_ref || 'N/A';
        
        // Log the notify action (existing)
        await db.from('actions_log').insert({ 
            vehicle_id: id, 
            action: 'notified', 
            timestamp: now, 
            operator_id: operator 
        });
        
        // NEW: Generate and log SMS
        const messageContent = generateMessageContent('notified', { po: po });
        await logSMS(id, 'notified', phone, messageContent);
        
        // Open SMS simulator
        window.open(`sms_simulator.html?type=notified&phone=${phone}&po=${po}`, 
            "_blank", 
            "width=400,height=700");
        
        await fetchVehicles();
        await fetchLogs();
    }
}

/**
 * OPTIONAL: release() - Also log SMS on release
 */
async function release(id) {
    const operator = localStorage.getItem('operator_id') || null;
    const now = new Date().toISOString();
    
    // Get vehicle for duration calculation
    const { data: vehicle } = await db
        .from('vehicles')
        .select('*')
        .eq('id', id)
        .single();
    
    const { error } = await db.from('vehicles').update({ 
        status: 'released', 
        release_time: now 
    }).eq('id', id);
    
    if (!error) {
        // Calculate duration
        const checkIn = new Date(vehicle.check_in_time);
        const durationMinutes = Math.floor((new Date(now) - checkIn) / 60000);
        const duration = `${durationMinutes} mins`;
        
        const phone = vehicle?.mobile_number || vehicle?.pager_number || 'N/A';
        const po = vehicle?.po_ref || 'N/A';
        
        // Log the release action (existing)
        await db.from('actions_log').insert({ 
            vehicle_id: id, 
            action: 'released', 
            timestamp: now, 
            operator_id: operator 
        });
        
        // NEW: Generate and log SMS
        const messageContent = generateMessageContent('released', { 
            po: po, 
            duration: duration 
        });
        await logSMS(id, 'released', phone, messageContent);
        
        // Optional: Open SMS simulator
        window.open(`sms_simulator.html?type=released&phone=${phone}&po=${po}&duration=${duration}`, 
            "_blank", 
            "width=400,height=700");
        
        await fetchVehicles();
        await fetchLogs();
    }
}

// ============================================================================
// QUERY FUNCTIONS - Add these to fetch SMS history
// ============================================================================

/**
 * Get SMS history for a specific vehicle
 */
async function getVehicleSMSHistory(vehicleId) {
    const { data, error } = await db
        .from('actions_log')
        .select(`
            message_type,
            recipient_phone,
            message_content,
            timestamp,
            message_sent,
            operators(name)
        `)
        .eq('vehicle_id', vehicleId)
        .not('message_type', 'is', null)
        .order('timestamp', { ascending: true });
    
    if (error) {
        console.error('Error fetching SMS history:', error);
        return [];
    }
    
    return data;
}

/**
 * Get today's SMS statistics
 */
async function getTodaySMSStats() {
    const today = new Date().toISOString().slice(0, 10);
    
    const { data, error } = await db
        .from('actions_log')
        .select('message_type')
        .eq('message_sent', true)
        .gte('timestamp', today);
    
    if (error) {
        console.error('Error fetching SMS stats:', error);
        return { total: 0, byType: {} };
    }
    
    const byType = {};
    data.forEach(row => {
        byType[row.message_type] = (byType[row.message_type] || 0) + 1;
    });
    
    return {
        total: data.length,
        byType: byType
    };
}

/**
 * Display SMS history in activity feed (enhanced version)
 */
async function renderActivityWithSMS() {
    const container = document.getElementById('activityList');
    container.innerHTML = '<h3>Recent Activity</h3>';
    
    const { data } = await db
        .from('actions_log')
        .select(`
            timestamp,
            action,
            message_type,
            recipient_phone,
            operators(name),
            vehicles(registration, po_ref)
        `)
        .order('timestamp', { ascending: false })
        .limit(20);
    
    if (!data) return;
    
    data.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const opName = log.operators?.name || 'Unknown';
        const reg = log.vehicles?.registration || 'Unknown';
        const po = log.vehicles?.po_ref || '';
        
        let actionText = log.action;
        let icon = '📋';
        
        // Add SMS indicator
        if (log.message_type) {
            icon = '📱';
            actionText = `${log.action} (SMS sent to ${log.recipient_phone})`;
        }
        
        container.innerHTML += `
            <div style="margin-bottom:10px; padding:8px; background:#1f1f1f; border-radius:6px;">
                ${icon} <strong>${reg}</strong> ${po}<br>
                <span style="font-size:13px; color:#aaa;">
                    ${actionText} by ${opName} — ${time}
                </span>
            </div>
        `;
    });
}

// ============================================================================
// EXAMPLE: Add SMS stats to dashboard KPI
// ============================================================================

async function updateSMSKPI() {
    const stats = await getTodaySMSStats();
    
    // Add this HTML somewhere in your dashboard
    const kpiHTML = `
        <div class="tile">
            <div class="value">${stats.total}</div>
            SMS Sent Today
        </div>
    `;
    
    // Or update existing element
    const kpiElement = document.getElementById('kpiSMSSent');
    if (kpiElement) {
        kpiElement.textContent = stats.total;
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Call this on page load to show SMS in activity feed
// renderActivityWithSMS();

// Call this to update SMS KPI
// updateSMSKPI();
// setInterval(updateSMSKPI, 30000); // Update every 30 seconds