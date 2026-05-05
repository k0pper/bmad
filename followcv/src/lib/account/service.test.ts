import { describe, it, expect, vi, beforeEach } from "vitest"
import { deleteAccount, revokeGmailAccess } from "./service"

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      delete: vi.fn(),
    },
    gmailToken: {
      delete: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"

type MockPrisma = {
  user: { delete: ReturnType<typeof vi.fn> }
  gmailToken: { delete: ReturnType<typeof vi.fn> }
}

const mock = prisma as unknown as MockPrisma
const mockUserDelete = vi.mocked(mock.user.delete)
const mockGmailDelete = vi.mocked(mock.gmailToken.delete)

beforeEach(() => {
  mockUserDelete.mockReset()
  mockGmailDelete.mockReset()
})

describe("deleteAccount", () => {
  it("deletes the user by id", async () => {
    const deleted = { id: "user-1", email: "test@example.com" }
    mockUserDelete.mockResolvedValue(deleted)

    const result = await deleteAccount("user-1")

    expect(mockUserDelete).toHaveBeenCalledWith({ where: { id: "user-1" } })
    expect(result).toEqual(deleted)
  })
})

describe("revokeGmailAccess", () => {
  it("deletes the gmail token by userId", async () => {
    const deleted = { id: "token-1", userId: "user-1" }
    mockGmailDelete.mockResolvedValue(deleted)

    const result = await revokeGmailAccess("user-1")

    expect(mockGmailDelete).toHaveBeenCalledWith({ where: { userId: "user-1" } })
    expect(result).toEqual(deleted)
  })
})
