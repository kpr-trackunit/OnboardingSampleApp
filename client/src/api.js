// Saves a customer and returns the updated customer. On failure the Error
// carries the server's message, plus `errors` ({ field: message }) when the
// server reported problems with specific fields.
export async function saveCustomer(id, updates) {
  const res = await fetch(`/api/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.errors = body.errors || {};
    throw err;
  }
  return body;
}
