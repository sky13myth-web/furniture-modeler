import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGlobalKeydown } from '../src/studio.js';

function createMockEvent(key, target = {}) {
  return {
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    target: {
      tagName: 'DIV',
      isContentEditable: false,
      matches: () => false,
      ...target
    }
  };
}

test('handleGlobalKeydown triggers deletion on Delete and Backspace in cabinet scheme view', () => {
  let deletedId = null;
  const context = {
    mode: 'cabinet',
    cabinetView: 'scheme',
    roomView: 'plan',
    cabinetId: 'cab-123',
    deleteCabinet: id => { deletedId = id; },
    modalOpen: false
  };

  const deleteEv = createMockEvent('Delete');
  const handledDelete = handleGlobalKeydown(deleteEv, context);
  assert.equal(handledDelete, true);
  assert.equal(deleteEv.defaultPrevented, true);
  assert.equal(deletedId, 'cab-123');

  deletedId = null;
  const backspaceEv = createMockEvent('Backspace');
  const handledBackspace = handleGlobalKeydown(backspaceEv, context);
  assert.equal(handledBackspace, true);
  assert.equal(backspaceEv.defaultPrevented, true);
  assert.equal(deletedId, 'cab-123');
});

test('handleGlobalKeydown triggers deletion in room 3D and room render views', () => {
  let deletedId = null;
  const context3D = {
    mode: 'room',
    roomView: '3d',
    cabinetView: 'scheme',
    cabinetId: 'cab-456',
    deleteCabinet: id => { deletedId = id; },
    modalOpen: false
  };

  const ev3D = createMockEvent('Delete');
  assert.equal(handleGlobalKeydown(ev3D, context3D), true);
  assert.equal(ev3D.defaultPrevented, true);
  assert.equal(deletedId, 'cab-456');

  deletedId = null;
  const contextRender = {
    mode: 'room',
    roomView: 'render',
    cabinetView: 'scheme',
    cabinetId: 'cab-789',
    deleteCabinet: id => { deletedId = id; },
    modalOpen: false
  };

  const evRender = createMockEvent('Backspace');
  assert.equal(handleGlobalKeydown(evRender, contextRender), true);
  assert.equal(evRender.defaultPrevented, true);
  assert.equal(deletedId, 'cab-789');
});

test('handleGlobalKeydown ignores non-deletion keys', () => {
  let deleted = false;
  const context = {
    mode: 'cabinet',
    cabinetView: 'scheme',
    cabinetId: 'cab-1',
    deleteCabinet: () => { deleted = true; }
  };

  for (const key of ['Enter', 'Escape', 'd', 'DeleteCabinet', 'x', 'Space', 'Tab']) {
    const ev = createMockEvent(key);
    assert.equal(handleGlobalKeydown(ev, context), false);
    assert.equal(ev.defaultPrevented, false);
    assert.equal(deleted, false);
  }
});

test('handleGlobalKeydown guards text inputs, textareas, selects, and contenteditable', () => {
  let deleted = false;
  const context = {
    mode: 'cabinet',
    cabinetView: 'scheme',
    cabinetId: 'cab-1',
    deleteCabinet: () => { deleted = true; }
  };

  const inputEv = createMockEvent('Delete', { tagName: 'INPUT' });
  assert.equal(handleGlobalKeydown(inputEv, context), false);
  assert.equal(inputEv.defaultPrevented, false);

  const textareaEv = createMockEvent('Backspace', { tagName: 'TEXTAREA' });
  assert.equal(handleGlobalKeydown(textareaEv, context), false);
  assert.equal(textareaEv.defaultPrevented, false);

  const selectEv = createMockEvent('Delete', { tagName: 'SELECT' });
  assert.equal(handleGlobalKeydown(selectEv, context), false);
  assert.equal(selectEv.defaultPrevented, false);

  const editableEv = createMockEvent('Backspace', { tagName: 'DIV', isContentEditable: true });
  assert.equal(handleGlobalKeydown(editableEv, context), false);
  assert.equal(editableEv.defaultPrevented, false);

  assert.equal(deleted, false);
});

test('handleGlobalKeydown guards against modal dialog open and missing selection', () => {
  let deleted = false;
  const contextModal = {
    mode: 'cabinet',
    cabinetView: 'scheme',
    cabinetId: 'cab-1',
    modalOpen: true,
    deleteCabinet: () => { deleted = true; }
  };

  const evModal = createMockEvent('Delete');
  assert.equal(handleGlobalKeydown(evModal, contextModal), false);
  assert.equal(deleted, false);

  const contextNoCab = {
    mode: 'cabinet',
    cabinetView: 'scheme',
    cabinetId: null,
    modalOpen: false,
    deleteCabinet: () => { deleted = true; }
  };

  const evNoCab = createMockEvent('Delete');
  assert.equal(handleGlobalKeydown(evNoCab, contextNoCab), false);
  assert.equal(deleted, false);
});

test('handleGlobalKeydown ignores modes and views outside cabinet scheme and room 3d/render', () => {
  let deleted = false;
  const del = () => { deleted = true; };

  // Cabinet 3D view (part inspection, not scheme)
  assert.equal(handleGlobalKeydown(createMockEvent('Delete'), { mode: 'cabinet', cabinetView: '3d', cabinetId: 'c1', deleteCabinet: del }), false);
  // Room 2D plan view (handled by RoomEditor directly)
  assert.equal(handleGlobalKeydown(createMockEvent('Delete'), { mode: 'room', roomView: 'plan', cabinetId: 'c1', deleteCabinet: del }), false);
  // Cutting mode
  assert.equal(handleGlobalKeydown(createMockEvent('Delete'), { mode: 'cutting', cabinetId: 'c1', deleteCabinet: del }), false);
  // Drawings mode
  assert.equal(handleGlobalKeydown(createMockEvent('Delete'), { mode: 'drawings', cabinetId: 'c1', deleteCabinet: del }), false);

  assert.equal(deleted, false);
});
