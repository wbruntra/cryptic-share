#!/usr/bin/env bun
import { httpServer } from '../app'

const port = process.env.PORT || 8921

httpServer.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`)
})
