/**
 * Database query functions
 */

export async function fetchWarehouses(env) {
	try {
		const res = await env.DB.prepare('SELECT * FROM warehouses ORDER BY priority ASC').all();
		return res && res.results
			? res.results.map((r) => ({
					warehouseId: r.warehouse_id,
					name: r.name,
					zone: r.zone,
					pincode: r.pincode,
					handlingHours: r.handling_hours,
					cutoffHour: r.cutoff_hour,
					priority: r.priority,
				}))
			: [];
	} catch (e) {
		console.error('fetchWarehouses error', e);
		return [];
	}
}

export async function getPincodeZone(env, pincode) {
	if (!pincode) return null;
	try {
		const raw = await env.PINCODE_KV.get(`pincode:${pincode}`);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return parsed.zone || null;
	} catch (e) {
		console.error('getPincodeZone error', e);
		return null;
	}
}
