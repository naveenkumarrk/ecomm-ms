/**
 * Gateway service integration for fetching user data
 */

export async function fetchUserAddresses(gatewayUrl, authToken) {
	try {
		const addrRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/api/addresses`, {
			headers: { Authorization: authToken },
		});
		if (addrRes.ok) {
			const addrJson = await addrRes.json();
			return addrJson.addresses || [];
		}
		return [];
	} catch (e) {
		console.error('Failed to fetch addresses from gateway:', e);
		return [];
	}
}

export async function fetchUserInfo(gatewayUrl, authToken) {
	try {
		const meRes = await fetch(`${gatewayUrl.replace(/\/$/, '')}/api/auth/me`, {
			headers: { Authorization: authToken },
		});
		if (meRes.ok) {
			return await meRes.json();
		}
		return null;
	} catch (e) {
		console.error('Failed to fetch user info from gateway:', e);
		return null;
	}
}
