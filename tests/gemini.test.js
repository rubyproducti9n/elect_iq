import { askGemini } from '../assets/js/gemini.js';

describe('gemini.js Module', () => {
  let fetchStub;

  beforeEach(() => {
    fetchStub = vi.fn();
    window.fetch = fetchStub;
    sessionStorage.clear();
  });

  afterEach(() => {
    window.fetch = undefined;
  });

  it('builds correct request body with system prompt + history', async () => {
    fetchStub.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Response' }] } }] })
    });
    
    await askGemini('Hello', [{ role: 'user', content: 'Prev' }]);
    const reqBody = JSON.parse(fetchStub.calls[0][1].body);
    expect(reqBody.contents).to.have.length(2);
    expect(reqBody.system_instruction).to.exist;
  });

  it('parses SUGGESTIONS: from response correctly', async () => {
    fetchStub.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Answer\nSUGGESTIONS: [Q1] | [Q2] | [Q3]' }] } }] })
    });
    
    const result = await askGemini('Hello');
    expect(result.text).to.equal('Answer');
    expect(result.suggestedQuestions).to.deep.equal(['Q1', 'Q2', 'Q3']);
  });

  it('returns error object on 429 response', async () => {
    fetchStub.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate Limited'
    });
    
    const result = await askGemini('Hello');
    expect(result.error).to.be.true;
    expect(result.code).to.equal(429);
  });

  it('retries up to 3 times on 500 errors', async () => {
    fetchStub.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Server Error'
    });
    
    await askGemini('Hello');
    expect(fetchStub.calls.length).to.equal(4); // 1 initial + 3 retries
  });

  it('rate limiter blocks after 10 requests in 60s', async () => {
    fetchStub.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] })
    });

    for (let i = 0; i < 10; i++) {
      await askGemini('test');
    }
    const result = await askGemini('11th test');
    expect(result.error).to.be.true;
    expect(result.message).to.include('sending messages too quickly');
  });

  it('rate limiter resets after 60s window', async () => {
    const stored = new Array(10).fill(Date.now() - 61000);
    sessionStorage.setItem('electiq_api_timestamps', JSON.stringify(stored));
    
    fetchStub.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] })
    });

    const result = await askGemini('test');
    expect(result.error).to.be.undefined;
  });
});
