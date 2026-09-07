const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/#metas',
  runScripts: 'outside-only'
});

dom.window.LOCAL_SUPABASE_URL = '';
dom.window.LOCAL_SUPABASE_KEY = '';
dom.window.eval(script);

const clientes = [
  { id: 'a', company: 'Cliente antigo', plan: 'Starter', status: 'Ativo' },
  { id: 'b', company: 'Cliente novo', plan: 'Starter', valorPersonalizado: 97, status: 'Ativo' },
  { id: 'c', company: 'Cliente extra', plan: 'Crescimento', status: 'Ativo' }
];
const pagamentos = [
  { store: 'a', tipo: 'mensalidade', valor: 69, data: '2026-08-20', mes: '2026-08' },
  { store: 'a', tipo: 'mensalidade', valor: 69, data: '2026-09-20', mes: '2026-09' },
  { store: 'b', tipo: 'mensalidade', valor: 97, data: '2026-09-05', mes: '2026-09' },
  { store: 'b', tipo: 'extra', valor: 20, data: '2026-09-06', mes: '2026-09' },
  { store: 'c', tipo: 'mensalidade', valor: 147, data: '2026-07-10', mes: '2026-07' },
  { store: 'c', tipo: 'extra', valor: 50, data: '2026-09-07', mes: '2026-09' }
];

const resultado = dom.window.calcularMetasDoPeriodo(clientes, pagamentos, '2026-09');
assert.equal(resultado.clientesFechados, 1, 'renovação de cliente antigo não deve contar como fechamento');
assert.equal(resultado.fechados[0].cliente.company, 'Cliente novo');
assert.equal(resultado.novoMrr, 97);
assert.equal(resultado.recebidoPeriodo, 236);
assert.equal(resultado.pagamentosPeriodo.length, 3);
assert.equal(resultado.fechados[0].totalHistorico, 117);

dom.window.renderMetas({ clientes: 2, mrr: 200, recebimentos: 300 }, resultado);
assert.equal(dom.window.document.getElementById('metas-kpi-clientes').textContent, '1 de 2');
assert.equal(dom.window.document.getElementById('metas-kpi-mrr').textContent, 'R$ 97,00');
assert.match(dom.window.document.getElementById('metas-fechados-body').textContent, /Cliente novo/);
assert.match(dom.window.document.getElementById('metas-pagamentos-body').textContent, /Cliente antigo/);

console.log('Metas: agregação e renderização validadas.');
dom.window.close();
