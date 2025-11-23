/**
 * Test setup file - runs before all tests
 */
import chai from 'chai';
import sinonChai from 'sinon-chai';
import sinon from 'sinon';

// Setup chai plugins
chai.use(sinonChai);

// Make chai available globally
global.expect = chai.expect;
global.assert = chai.assert;
global.should = chai.should();
global.sinon = sinon;
