import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isModernCandidateModel,
  isSuspiciousListingTitle,
  isUnrealisticCandidatePrice,
} from './analyze.mjs';

test('flags broken, accessory, box, and trade-only titles as suspicious', () => {
  assert.equal(isSuspiciousListingTitle('RTX 3060 arizali goruntu yok'), true);
  assert.equal(isSuspiciousListingTitle('4060 Ekran Karti Kutusu'), true);
  assert.equal(isSuspiciousListingTitle('RTX4090 icin 16 Pin Guc Kaynagi 12VHPWR kablo'), true);
  assert.equal(isSuspiciousListingTitle('ASUS dual rx6600 fanlari ve fan cercevesi'), true);
  assert.equal(isSuspiciousListingTitle('MSI RTX 3080 fan donuyor goruntu yok'), true);
  assert.equal(isSuspiciousListingTitle('GIGABYTE GTX 1060 3GB sadece takas'), true);
  assert.equal(isSuspiciousListingTitle('ASUS TUF RTX 4070 Super garantili temiz'), false);
});

test('keeps only modern GPU families for top opportunity candidates', () => {
  assert.equal(isModernCandidateModel('RTX 4070 SUPER'), true);
  assert.equal(isModernCandidateModel('RTX 3060 12GB'), true);
  assert.equal(isModernCandidateModel('RX 7700 XT 12GB'), true);
  assert.equal(isModernCandidateModel('RX 580 8GB'), false);
  assert.equal(isModernCandidateModel('GTX 1060 3GB'), false);
  assert.equal(isModernCandidateModel('Radeon HD 7850'), false);
});

test('rejects placeholder prices far below a realistic reference price', () => {
  assert.equal(isUnrealisticCandidatePrice(1, 30000), true);
  assert.equal(isUnrealisticCandidatePrice(100, 12000), true);
  assert.equal(isUnrealisticCandidatePrice(1650, 115000), true);
  assert.equal(isUnrealisticCandidatePrice(10000, 16000), false);
});
