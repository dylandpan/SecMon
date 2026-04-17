// ============================================
// INTENTIONALLY VULNERABLE CODE FOR SAST TESTING
// This file contains examples of all vulnerability
// types our scanner detects
// ============================================

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const { exec } = require('child_process');

// --- HIGH: HARDCODED_SECRET ---
const apiKey = 'FAKE_AKIAIOSFODNN7EXAMPLE_NOT_REAL';
const password = 'super_secret_password_123';
const secretKey = 'FAKE_sk_live_abc123def456_NOT_REAL';
const ghToken = 'FAKE_ghp_ABCDEFGHIJKLMNOPQRST_NOT_REAL';

// --- HIGH: SQL_INJECTION ---
function getUserById(id) {
  const query = "SELECT * FROM users WHERE id = " + id;
  return db.query(query);
}

function deleteUser(username) {
  const query = `DELETE FROM users WHERE name = ${username}`;
  return db.query(query);
}

// --- HIGH: NOSQL_INJECTION ---
function findUser(req, res) {
  const user = db.collection('users').find(req.body);
  return user;
}

function findOneUser(req, res) {
  const user = db.collection('users').findOne(req.query);
  return user;
}

// --- HIGH: XSS ---
function renderProfile(userInput) {
  document.innerHTML = userInput;
  document.write(userInput);
}

// --- HIGH: PATH_TRAVERSAL ---
function readUserFile(req, res) {
  const data = fs.readFileSync(req.body.filename);
  const joined = path.join('/uploads', req.query.path);
  return data;
}

// --- HIGH: INSECURE_FUNCTION ---
function runUserCode(code) {
  eval(code);
  exec('rm -rf ' + userInput);
}

// --- MEDIUM: HARDCODED_IP ---
const dbHost = '192.168.1.100';
const apiServer = '10.0.0.55:8080';

// --- MEDIUM: WEAK_CRYPTO ---
const hash = crypto.createHash('md5').update('data').digest('hex');
const sha1Hash = crypto.createHash('sha1').update('password').digest('hex');

// --- MEDIUM: INSECURE_RANDOM ---
const sessionToken = Math.random().toString(36);
const verificationCode = Math.random() * 1000000;

// --- MEDIUM: SENSITIVE_DATA_LOG ---
console.log("User password is:", password);
console.log("API token:", apiKey);
console.log("Credit card: ", creditCardNumber);

// --- LOW: SECURITY_TODO ---
// TODO: fix security issue with authentication
// FIXME: vulnerability in token validation
// HACK: bypassing auth check temporarily

module.exports = { getUserById, findUser, renderProfile };
