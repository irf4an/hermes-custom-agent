    // Single fetch helper for JSON APIs. Same contract as the call sites it
    // replaces: throws caller-supplied error when HTTP is not OK, otherwise
    // returns parsed JSON (parse errors propagate to the caller's catch).
    async function api(path, options = {}, errorMessage = 'Request failed') {
      const res = await fetch(path, options);
      if (!res.ok) throw new Error(errorMessage);
      return res.json();
    }

    // Same as api(), but preserves HTTP status and body for callers that
    // branch on them (202 vs 409, data.success, server error text).
    // Returns { ok, status, data }; data is {} when the body is not JSON.
    async function apiFull(path, options = {}) {
      const res = await fetch(path, options);
      let data = {};
      try { data = await res.json(); } catch (e) { data = {}; }
      return { ok: res.ok, status: res.status, data };
    }
