/**
 * Unit tests for db/helpers.js
 */
import { describe, it, beforeEach } from 'mocha';
import { dbGet, dbRun, dbAll } from '../../../src/db/helpers.js';
import sinon from 'sinon';

describe('db.helpers', () => {
	let env;

	beforeEach(() => {
		env = {
			DB: {
				prepare: sinon.stub().returns({
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub(),
					all: sinon.stub(),
				}),
			},
		};
	});

	describe('dbGet', () => {
		it('should return first result from query', async () => {
			const mockResult = { userId: 'user123', email: 'test@example.com' };
			const stmt = env.DB.prepare();
			stmt.first.resolves(mockResult);

			const result = await dbGet(env, 'SELECT * FROM users WHERE email=?', ['test@example.com']);

			expect(result).to.deep.equal(mockResult);
			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM users WHERE email=?');
			expect(stmt.bind).to.have.been.calledWith('test@example.com');
		});

		it('should return null when no results', async () => {
			const stmt = env.DB.prepare();
			stmt.first.resolves(null);

			const result = await dbGet(env, 'SELECT * FROM users WHERE email=?', ['notfound@example.com']);

			expect(result).to.be.null;
		});

		it('should handle empty params array', async () => {
			const stmt = env.DB.prepare();
			stmt.first.resolves({ count: 5 });

			const result = await dbGet(env, 'SELECT COUNT(*) as count FROM users', []);

			expect(result).to.deep.equal({ count: 5 });
		});
	});

	describe('dbRun', () => {
		it('should execute INSERT query', async () => {
			const stmt = env.DB.prepare();
			stmt.run.resolves({ success: true, changes: 1 });

			const result = await dbRun(env, 'INSERT INTO users (userId, email) VALUES (?, ?)', ['user123', 'test@example.com']);

			expect(result).to.have.property('success', true);
			expect(env.DB.prepare).to.have.been.calledWith('INSERT INTO users (userId, email) VALUES (?, ?)');
			expect(stmt.bind).to.have.been.calledWith('user123', 'test@example.com');
		});

		it('should execute UPDATE query', async () => {
			const stmt = env.DB.prepare();
			stmt.run.resolves({ success: true, changes: 1 });

			const result = await dbRun(env, 'UPDATE users SET email=? WHERE userId=?', ['new@example.com', 'user123']);

			expect(result).to.have.property('success', true);
		});

		it('should handle empty params array', async () => {
			const stmt = env.DB.prepare();
			stmt.run.resolves({ success: true });

			const result = await dbRun(env, 'DELETE FROM sessions WHERE expires_at < ?', [1234567890]);

			expect(result).to.have.property('success', true);
		});
	});

	describe('dbAll', () => {
		it('should return all results from query', async () => {
			const mockResults = {
				results: [
					{ userId: 'user1', email: 'user1@example.com' },
					{ userId: 'user2', email: 'user2@example.com' },
				],
			};

			const stmt = env.DB.prepare();
			stmt.all.resolves(mockResults);

			const result = await dbAll(env, 'SELECT * FROM users', []);

			expect(result).to.be.an('array').with.length(2);
			expect(result[0]).to.deep.equal({ userId: 'user1', email: 'user1@example.com' });
		});

		it('should return empty array when no results', async () => {
			const stmt = env.DB.prepare();
			stmt.all.resolves({ results: [] });

			const result = await dbAll(env, 'SELECT * FROM users WHERE email=?', ['notfound@example.com']);

			expect(result).to.be.an('array').that.is.empty;
		});

		it('should return empty array when result is null', async () => {
			const stmt = env.DB.prepare();
			stmt.all.resolves(null);

			const result = await dbAll(env, 'SELECT * FROM users', []);

			expect(result).to.be.an('array').that.is.empty;
		});

		it('should return empty array when result has no results property', async () => {
			const stmt = env.DB.prepare();
			stmt.all.resolves({});

			const result = await dbAll(env, 'SELECT * FROM users', []);

			expect(result).to.be.an('array').that.is.empty;
		});
	});
});
