/**
 * OpenTelemetry tracing helpers for database operations
 * Creates nested spans for DB queries
 */
import { trace, context } from '@opentelemetry/api';

/**
 * Instrument a database query with a span
 * @param {string} operation - Operation name (e.g., "db.query.getProducts")
 * @param {string} query - SQL query string
 * @param {Function} queryFn - The actual query function to execute
 * @returns {Promise} Query result
 */
export async function instrumentDbQuery(operation, query, queryFn) {
	const tracer = trace.getTracer('product-worker-db');
	const span = tracer.startSpan(operation, {
		attributes: {
			'db.system': 'd1',
			'db.operation': operation,
			'db.statement': query,
		},
	});

	try {
		const startTime = Date.now();
		const result = await context.with(trace.setSpan(context.active(), span), async () => {
			return await queryFn();
		});
		const duration = Date.now() - startTime;

		span.setAttribute('db.duration_ms', duration);

		// Add result metadata
		if (result) {
			if (result.results) {
				span.setAttribute('db.rows_returned', result.results.length);
			} else if (result.success !== undefined) {
				span.setAttribute('db.success', result.success);
			}
		}

		span.setStatus({ code: 1 }); // OK
		return result;
	} catch (error) {
		span.recordException(error);
		span.setStatus({
			code: 2, // ERROR
			message: error.message,
		});
		span.setAttribute('db.error', error.message);
		throw error;
	} finally {
		span.end();
	}
}

/**
 * Helper to create a span for any operation
 * @param {string} operationName - Name of the operation
 * @param {Function} operationFn - Function to execute within the span
 * @param {Object} attributes - Additional span attributes
 * @returns {Promise} Operation result
 */
export async function instrumentOperation(operationName, operationFn, attributes = {}) {
	const tracer = trace.getTracer('product-worker');
	const span = tracer.startSpan(operationName, {
		attributes: {
			...attributes,
		},
	});

	try {
		const result = await context.with(trace.setSpan(context.active(), span), async () => {
			return await operationFn();
		});

		span.setStatus({ code: 1 }); // OK
		return result;
	} catch (error) {
		span.recordException(error);
		span.setStatus({
			code: 2, // ERROR
			message: error.message,
		});
		throw error;
	} finally {
		span.end();
	}
}
