const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('lib/server/persona.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const valid = JSON.stringify({ knows: ['职业选择'], voiceSummary: '谨慎比较不同选择' });
const item = (id, text = '可核对的公开片段。'.repeat(12)) => ({ AuthorName: '测试作者', Url: 'https://www.zhihu.com/question/1/answer/' + id, ContentText: text, Title: '职业选择' });
async function run(items, replies = [valid], searchFails = false) {
  let searches = 0, models = 0;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === 'server-only') return {};
    if (name === '@/lib/zhihu/client') return {
      hasCredentials: () => true,
      zhihuSearch: async () => { searches++; if (searchFails) throw Error('network'); return { Items: items }; },
      zhidaText: async () => { const r = replies[models++]; if (r instanceof Error) throw r; return r; },
    };
    throw Error('Unexpected import: ' + name);
  }});
  const result = await exports.distillPersona('测试作者', '测试作者', '职业');
  return { result, searches, models };
}
(async () => {
  let r = await run([]); assert.equal(r.result.failureReason, 'no_match'); assert.equal(r.models, 0);
  r = await run([item(1, '太短')]); assert.equal(r.result.failureReason, 'no_valid_content'); assert.equal(r.result.matched, 1); assert.equal(r.result.validSamples, 0);
  r = await run([], [], true); assert.equal(r.result.failureReason, 'search_failed');
  r = await run([item(1)], [new Error('timeout')]); assert.equal(r.result.failureReason, 'model_failed'); assert.equal(r.result.sources.length, 1);
  r = await run([item(1)], ['broken', valid]); assert.equal(r.result.persona.corpus.real, true); assert.equal(r.models, 2); assert.equal(r.searches, 3);
  r = await run([item(1)], ['broken', 'broken']); assert.equal(r.result.failureReason, 'invalid_format'); assert.equal(r.models, 2); assert.equal(r.result.sources.length, 1);
  r = await run([item(1), item(1), item(2, '短'), item(3, '短'), item(4, '短')]); assert.equal(r.result.validSamples, 1); assert.equal(r.result.confidence, 'low');
  r = await run([item(1), item(2), item(3), item(4)]); assert.equal(r.result.confidence, 'high'); assert.equal(r.result.persona.corpus.sampleSize, 4);
  console.log('PASS: 8 persona failure, repair, deduplication and confidence scenarios (no live API calls)');
})().catch(e => { console.error(e); process.exitCode = 1; });
