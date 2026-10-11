import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestTrellisLayout } from '@/backend/trellisLayouts'
const document = { schema: 1 as const, root: null, floating: [], hidden: [], views: {} }
const input = { document, navigation: 'focus' as const, expectedRevision: 0, writer: 'Xaihi test' }
afterEach(()=>vi.unstubAllGlobals())
function respond(status: number, body: unknown) { vi.stubGlobal('fetch',vi.fn(async()=>new Response(typeof body==='string'?body:JSON.stringify(body),{status}))) }
describe('layout API error and conflict contract',()=>{
 it('makes absent service a visible session state only on reads',async()=>{
  respond(404,'not found')
  expect(await requestTrellisLayout('/xaihi/trellis-layouts.json')).toMatchObject({available:false,durable:false,reason:'LAYOUT_SERVICE_UNAVAILABLE'})
  await expect(requestTrellisLayout('/xaihi/trellis-layouts.json',input)).rejects.toThrow('HTTP 404')
 })
 it('retains a valid conflict record instead of treating it as a successful write',async()=>{
  respond(409,{durable:true,reason:null,layout:{...input,revision:2,updatedAt:10}})
  expect(await requestTrellisLayout('/xaihi/trellis-layouts.json',input)).toMatchObject({conflict:true,layout:{revision:2}})
 })
 it('rejects missing and invalid saved records',async()=>{
  respond(200,{durable:true,layout:null})
  await expect(requestTrellisLayout('/xaihi/trellis-layouts.json',input)).rejects.toThrow('response is invalid')
  respond(200,{durable:true,layout:{...input,revision:NaN,updatedAt:10}})
  await expect(requestTrellisLayout('/xaihi/trellis-layouts.json')).rejects.toThrow('stored layout is invalid')
 })
})
