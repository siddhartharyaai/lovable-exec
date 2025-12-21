#!/usr/bin/env node

/**
 * Validation Script for Man Friday
 * 
 * This script runs the critical user flow tests to ensure
 * the application is working correctly.
 * 
 * Usage:
 *   npm test
 *   or
 *   npx vitest
 */

console.log('🧪 Running Man Friday validation tests...\n');

const { spawnSync } = require('node:child_process');

const result = spawnSync('npx', ['vitest', 'run'], {
  stdio: 'inherit',
  shell: true,
});

process.exit(typeof result.status === 'number' ? result.status : 1);

