import { handle } from 'hono/vercel'
import app from '../src/index'

// Vercel routing sends dynamic requests to this Web-standard Hono handler.
export default handle(app)
