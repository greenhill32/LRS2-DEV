// START CONFIG — Auto environment switch

(function (global) {

    const hostname = window.location.hostname.toLowerCase();

    // DETECT ENVIRONMENT
    const ENV = (() => {

        // DEV domains
        if (
            hostname.includes("lrs-2-dev.vercel.app") ||
            hostname.includes("localhost") ||
            hostname.includes("127.0.0.1")
        ) {
            return "DEV";
        }

        // LIVE domain
        if (hostname.includes("lorry-bay-system.vercel.app")) {
            return "PROD";
        }

        // Default fallback
        return "DEV";
    })();


    // CONFIG FOR BOTH ENVS
    const CONFIG = {
        DEV: {
            url: "https://gtixdparpjdpyhhubsfz.supabase.co",
            key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0aXhkcGFycGpkcHloaHVic2Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MDUxNDksImV4cCI6MjA3ODk4MTE0OX0.jQdd18hGPESpDi7IvXWBZK0_bDy4-DKoSGHtZZpxAP0"
        },
        PROD: {
            url: "https://gtixdparpjdpyhhubsfz.supabase.co",
            key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0aXhkcGFycGpkcHloaHVic2Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MDUxNDksImV4cCI6MjA3ODk4MTE0OX0.jQdd18hGPESpDi7IvXWBZK0_bDy4-DKoSGHtZZpxAP0"
        }
    };

    // EXPORT VALUES TO WINDOW
    global.SUPABASE_URL = CONFIG[ENV].url;
    global.SUPABASE_KEY = CONFIG[ENV].key;
    global.APP_ENV = ENV;

    console.log("Environment:", ENV);

})(window);

// END CONFIG

