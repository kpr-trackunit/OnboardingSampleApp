import { useState, useEffect } from 'react';

// The allowed regions come from the server (GET /api/regions, the REGIONS
// constant in server/src/models), so the dropdowns never drift from what the
// server validates. Fetched once per page load and shared by every caller.
let regionsPromise = null;

function fetchRegions() {
  if (!regionsPromise) {
    regionsPromise = fetch('/api/regions')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(data => (Array.isArray(data) ? data : []))
      .catch(err => {
        console.error('Failed to fetch regions:', err);
        regionsPromise = null; // try again next time
        return [];
      });
  }
  return regionsPromise;
}

// Returns the region list; empty until it has loaded (or if loading failed).
export function useRegions() {
  const [regions, setRegions] = useState([]);
  useEffect(() => {
    let active = true;
    fetchRegions().then(list => { if (active) setRegions(list); });
    return () => { active = false; };
  }, []);
  return regions;
}

// The options a region dropdown should offer: the allowed regions, plus the
// current value first if it isn't one of them, so editing doesn't lose it.
export function regionOptions(regions, current) {
  return current && !regions.includes(current) ? [current, ...regions] : regions;
}
