// Hotbar data, hotbar UI and inventory UI (juice / spells step). DOM tests run on detached elements.
import { createHotbar, MAX_SLOTS, selectNext, selectIndex, selectedSpell, selectedIds, moveSlot, addSpell, hotbarKey } from '../js/hotbar.js';
import { registerSpellForTest, spellById, JUICE, juiceCap } from '../js/spells.js';
import { createHotbarUI } from '../js/hotbar-ui.js';
import { createInventoryUI } from '../js/inventory-ui.js';

export async function runHotbarTests(assert) {
  const remove = registerSpellForTest({ id: 'test-spark', name: 'Test Spark', effect: 'cloud', cost: 1, radius: 1, duration: 1, drift: 0 });
  try {
    const hb = createHotbar();
    assert('hotbar: default is one slot holding ink-cloud, selected', hb.slots.length === 1 && hb.slots[0].ids.length === 1 && hb.slots[0].ids[0] === 'ink-cloud' && hb.sel === 0);
    assert('hotbar: selectedSpell / selectedIds of the default', selectedSpell(hb) === 'ink-cloud' && selectedIds(hb).join() === 'ink-cloud');
    assert('hotbar: selectNext on one slot stays put', selectNext(hb, 1) === 0 && selectNext(hb, -1) === 0);

    const k0 = hotbarKey(hb);
    assert('hotbar: addSpell makes slot 2, rejects a duplicate', addSpell(hb, 'test-spark') && hb.slots.length === 2 && !addSpell(hb, 'test-spark'));
    assert('hotbar: hotbarKey changes when a slot is added', hotbarKey(hb) !== k0);
    assert('hotbar: selectNext +1 / -1 wraps', selectNext(hb, 1) === 1 && selectNext(hb, 1) === 0 && selectNext(hb, -1) === 1 && selectNext(hb, -1) === 0);
    assert('hotbar: selectIndex(1) picks the second spell, selectedSpell follows', selectIndex(hb, 1) === true && hb.sel === 1 && selectedSpell(hb) === 'test-spark');
    assert('hotbar: selectIndex out of range is ignored', selectIndex(hb, 5) === false && selectIndex(hb, -1) === false && hb.sel === 1);

    // reorder: the selected slot (test-spark) moves to the front and stays selected
    assert('hotbar: moveSlot reorders and the selection follows the moved slot', moveSlot(hb, 1, 0) && hb.slots[0].ids[0] === 'test-spark' && hb.sel === 0 && selectedSpell(hb) === 'test-spark');
    // moving the other slot across the selected one keeps the selection on the same spell
    assert('hotbar: moving another slot keeps the selection on the same slot object', moveSlot(hb, 1, 0) && hb.slots[0].ids[0] === 'ink-cloud' && hb.sel === 1 && selectedSpell(hb) === 'test-spark');
    assert('hotbar: moveSlot ignores bad indexes', moveSlot(hb, 0, 0) === false && moveSlot(hb, 0, 7) === false);

    const full = createHotbar(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
    assert('hotbar: MAX_SLOTS is 9 and caps createHotbar and addSpell', MAX_SLOTS === 9 && full.slots.length === 9 && addSpell(full, 'zz') === false && full.slots.length === 9);

    // ---------------------------------------------------------------- hotbar UI
    const hud = document.createElement('div');
    const picked = [];
    const ui = createHotbarUI(hud, { onSelect: (i) => picked.push(i) });
    const name = (id) => (spellById(id) ? spellById(id).name : id);
    const cap = juiceCap();
    const st = { slots: hb.slots, sel: hb.sel, spellName: name, bombs: 3, bombMax: 5, juice: JUICE.perCast, cap, perCast: JUICE.perCast };
    ui.update(st);
    const slotEls = ui.el.querySelectorAll('.octo-hb-spell');
    assert('hotbar ui: one slot element per spell slot, plus the bomb slot and the jar',
      slotEls.length === 2 && ui.el.querySelectorAll('.octo-hb-bomb').length === 1 && ui.el.querySelectorAll('.octo-hb-jar').length === 1);
    assert('hotbar ui: the selected slot is marked is-selected', slotEls[1].classList.contains('is-selected') && !slotEls[0].classList.contains('is-selected'));
    assert('hotbar ui: number keys 1..9 are drawn on the slots', slotEls[0].querySelector('.octo-hb-key').textContent === '1' && slotEls[1].querySelector('.octo-hb-key').textContent === '2');
    assert('hotbar ui: the bomb count reads bombs/bombMax', ui.el.querySelector('.octo-hb-count').textContent === '3/5');
    assert('hotbar ui: the jar shows whole casts', ui.el.querySelector('.octo-hb-casts').textContent === '1');
    slotEls[1].click();
    assert('hotbar ui: clicking slot 2 calls onSelect(1)', picked.length === 1 && picked[0] === 1);
    assert('hotbar ui: the bar lets clicks through (slots opt in via css)', ui.el.classList.contains('octo-hotbar'));

    const cvBefore = ui.el.querySelector('.octo-hb-spell canvas'), jarBefore = ui.el.querySelector('.octo-hb-jarcv');
    const textNode = ui.el.querySelector('.octo-hb-casts').firstChild;
    ui.update({ ...st });
    assert('hotbar ui: the same state twice rewrites nothing (canvas and text nodes keep identity)',
      ui.el.querySelector('.octo-hb-spell canvas') === cvBefore && ui.el.querySelector('.octo-hb-jarcv') === jarBefore && ui.el.querySelector('.octo-hb-casts').firstChild === textNode);
    ui.update({ ...st, sel: 0 });
    assert('hotbar ui: a new selection moves is-selected without rebuilding', slotEls[0].classList.contains('is-selected') && !slotEls[1].classList.contains('is-selected') && ui.el.querySelector('.octo-hb-spell canvas') === cvBefore);
    ui.update({ ...st, juice: 2 * JUICE.perCast, bombs: 0 });
    assert('hotbar ui: juice and bombs update their text', ui.el.querySelector('.octo-hb-casts').textContent === '2' && ui.el.querySelector('.octo-hb-count').textContent === '0/5');
    ui.shakeJar();
    assert('hotbar ui: shakeJar adds the shake class', ui.el.querySelector('.octo-hb-jar').classList.contains('octo-jar-shake'));
    ui.shakeJar();
    assert('hotbar ui: shakeJar is restartable', ui.el.querySelector('.octo-hb-jar').classList.contains('octo-jar-shake'));
    ui.setCompact(true);
    assert('hotbar ui: setCompact adds is-compact', ui.el.classList.contains('is-compact'));
    ui.setCompact(false); ui.setVisible(false);
    assert('hotbar ui: setCompact(false) and setVisible(false)', !ui.el.classList.contains('is-compact') && ui.el.style.display === 'none');
    ui.setVisible(true);

    // ---------------------------------------------------------------- inventory UI
    const moves = [], sels = []; let closed = 0;
    const inv = createInventoryUI(hud, { onClose: () => closed++, onMove: (a, b) => moves.push([a, b]), onSelect: (i) => sels.push(i) });
    const istate = { ...st, sel: 0, items: ['flippers', 'lantern', 'bombbag', 'bombbag'], spellRow: (id) => spellById(id) };
    assert('inventory: closed at first', inv.isOpen() === false);
    inv.show(istate);
    assert('inventory: isOpen after show, the root is a modal', inv.isOpen() === true && inv.el.dataset.octoModal === '1' && inv.el.style.display !== 'none');
    const text = inv.el.textContent;
    assert('inventory: lists both spells with name, blurb and cost', text.includes('Ink Cloud') && text.includes('Test Spark') && text.includes('enemies lose sight of you') && text.includes('costs 1 cast'));
    const passive = [...inv.el.querySelectorAll('.octo-inv-passive')];
    const names = passive.map((p) => p.querySelector('.octo-inv-name').textContent);
    assert('inventory: passive items listed once each, stacks shown as x2', passive.length === 3 && names.includes('Flippers') && names.includes('Lantern') && names.includes('Bomb bag x2'));
    assert('inventory: every carried item is marked passive', passive.every((p) => p.querySelector('.octo-inv-tag').textContent === 'passive'));
    assert('inventory: the bomb row shows the count as active', inv.el.querySelector('.octo-inv-bomb').textContent.includes('3/5') && inv.el.querySelector('.octo-inv-bomb .octo-inv-tag').textContent === 'active');
    assert('inventory: the fish juice section reads N of 3 casts', text.includes('1 of 3 casts'));
    const rows = inv.el.querySelectorAll('.octo-inv-spell');
    assert('inventory: the first move-left is disabled, the last move-right too', rows[0].querySelector('[data-dir="left"]').disabled && rows[1].querySelector('[data-dir="right"]').disabled);
    rows[0].querySelector('[data-dir="right"]').click();
    assert('inventory: the move button calls onMove(0, 1) and not onSelect', moves.length === 1 && moves[0][0] === 0 && moves[0][1] === 1 && sels.length === 0);
    rows[1].click();
    assert('inventory: tapping a row calls onSelect(1)', sels.length === 1 && sels[0] === 1);
    inv.refresh({ ...istate, items: ['flippers'] });
    assert('inventory: refresh redraws with the new state', inv.el.querySelectorAll('.octo-inv-passive').length === 1);
    inv.el.querySelector('.octo-inv-close').click();
    assert('inventory: the close button calls onClose', closed === 1);
    inv.hide();
    assert('inventory: hide closes it', inv.isOpen() === false && inv.el.style.display === 'none');
  } finally {
    remove();
  }
}
