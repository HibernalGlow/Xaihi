import {
  nexusCaptureRequestSchema,
  nexusCaptureSchema,
  type NexusCaptureDTO,
  type NexusCaptureRequestDTO,
} from "@xiranite/shared"

export class NexusCaptureInbox {
  private readonly captures: NexusCaptureDTO[] = []

  constructor(
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly now: () => Date = () => new Date(),
    private readonly capacity = 200,
  ) {}

  add(input: NexusCaptureRequestDTO): NexusCaptureDTO {
    const request = nexusCaptureRequestSchema.parse(input)
    const capture = nexusCaptureSchema.parse({
      ...request,
      id: this.createId(),
      receivedAt: this.now().toISOString(),
    })
    this.captures.push(capture)
    if (this.captures.length > this.capacity) this.captures.splice(0, this.captures.length - this.capacity)
    return capture
  }

  list(targetNodeId?: string): NexusCaptureDTO[] {
    return this.captures.filter((capture) => !targetNodeId || capture.targetNodeId === targetNodeId)
  }

  remove(id: string): boolean {
    const index = this.captures.findIndex((capture) => capture.id === id)
    if (index < 0) return false
    this.captures.splice(index, 1)
    return true
  }
}
