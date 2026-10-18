// The web build's only server-side code: a stateless relay to Yahoo's chart
// endpoint, so a browser can fetch quotes without loosening `connect-src`.
// See src/lib/quotes/proxy.ts for what it does and, as importantly, does not.
import { handleQuote } from '../../src/lib/quotes/proxy';

const quote = (req: Request) => handleQuote(req);
export default quote;
