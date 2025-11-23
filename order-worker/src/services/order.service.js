/**
 * Order business logic service
 */
import { parseJSONSafe } from '../helpers/utils.js';

export function transformOrderRow(row) {
	return {
		...row,
		items_json: parseJSONSafe(row.items_json, []),
		address_json: parseJSONSafe(row.address_json, null),
		shipping_json: parseJSONSafe(row.shipping_json, null),
		payment_json: parseJSONSafe(row.payment_json, null),
	};
}

export function transformOrderRows(rows) {
	return (rows.results || []).map((row) => transformOrderRow(row));
}
