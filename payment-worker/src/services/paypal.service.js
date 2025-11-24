/**
 * PayPal service integration
 */

let _paypalTokenCache = { token: null, expiresAt: 0 };

export async function getPaypalAccessToken(env) {
	const now = Date.now();
	if (_paypalTokenCache.token && _paypalTokenCache.expiresAt > now + 5000) {
		return _paypalTokenCache.token;
	}

	const clientId = env.PAYPAL_CLIENT_ID;
	const secret = env.PAYPAL_SECRET;
	const base = (env.PAYPAL_API || '').replace(/\/$/, '');
	const creds = btoa(`${clientId}:${secret}`);

	const res = await fetch(`${base}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${creds}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: 'grant_type=client_credentials',
	});

	if (!res.ok) {
		const txt = await res.text();
		throw new Error(`paypal_token_error: ${res.status} ${txt}`);
	}

	const data = await res.json();
	const token = data.access_token;
	const expiresIn = Number(data.expires_in || 3600) * 1000;
	_paypalTokenCache = { token, expiresAt: Date.now() + expiresIn };

	return token;
}

export async function createPaypalOrder(env, reservationId, amount, currency, returnUrl) {
	const token = await getPaypalAccessToken(env);
	const base = (env.PAYPAL_API || '').replace(/\/$/, '');
	const formattedAmount = parseFloat(amount).toFixed(2);

	const createRes = await fetch(`${base}/v2/checkout/orders`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': reservationId,
		},
		body: JSON.stringify({
			intent: 'CAPTURE',
			purchase_units: [
				{
					amount: {
						currency_code: currency,
						value: formattedAmount,
					},
					custom_id: reservationId,
				},
			],
			application_context: {
				return_url: returnUrl || env.BASE_RETURN_URL,
				cancel_url: env.BASE_CANCEL_URL,
				user_action: 'PAY_NOW',
			},
		}),
	});

	const cr = await createRes.json();

	if (!createRes.ok) {
		throw { error: 'paypal_create_failed', details: cr, status: createRes.status };
	}

	const links = cr.links || [];
	const approve = (links.find((l) => l.rel === 'approve') || {}).href || null;
	const orderID = cr.id;

	return { orderID, approveUrl: approve, raw: cr };
}

export async function capturePaypalOrder(env, paypalOrderId) {
	const token = await getPaypalAccessToken(env);
	const base = (env.PAYPAL_API || '').replace(/\/$/, '');

	const capRes = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	});

	const capJson = await capRes.json();

	if (!capRes.ok) {
		throw { error: 'capture_failed', details: capJson, status: capRes.status };
	}

	// Verify capture in PayPal response
	const purchaseUnits = capJson.purchase_units || [];
	let captured = false;
	let captureId = null;

	for (const pu of purchaseUnits) {
		const captures = (pu.payments || {}).captures || [];
		for (const c of captures) {
			if (c.status && (c.status === 'COMPLETED' || c.status === 'PENDING')) {
				captured = true;
				captureId = c.id;
				break;
			}
		}
		if (captured) break;
	}

	if (!captured) {
		throw { error: 'not_captured', details: capJson };
	}

	return { captureId, raw: capJson };
}

export async function verifyPaypalOrder(env, orderId) {
	const token = await getPaypalAccessToken(env);
	const base = (env.PAYPAL_API || '').replace(/\/$/, '');

	const res = await fetch(`${base}/v2/checkout/orders/${orderId}`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	});

	const data = await res.json();
	return { ok: res.ok, status: res.status, data };
}
