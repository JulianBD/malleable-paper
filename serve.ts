import index from "./index.html"

const port = Number(process.env.PORT ?? 5173)
const server = Bun.serve({
  port,
  routes: { "/": index },
  development: { hmr: true, console: true },
})
console.log(`malleable-paper → http://localhost:${server.port}`)
