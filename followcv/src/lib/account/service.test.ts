import { describe, it, expect, vi, beforeEach } from "vitest"
import { deleteAccount, revokeGmailAccess } from "./service"

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      delete: vi.fn(),
    },
    gmailToken: {
      deleteMany: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"

type MockPrisma = {
  user: { delete: ReturnType<typeof vi.fn> }
  gmailToken: { deleteMany: ReturnType<typeof vi.fn> }
}

const mock = prisma as unknown as MockPrisma
const mockUserDelete = vi.mocked(mock.user.delete)
const mockGmailDelete = vi.mocked(mock.gmailToken.deleteMany)

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
    mockGmailDelete.mockResolvedValue({ count: 1 })

    await revokeGmailAccess("user-1")

    expect(mockGmailDelete).toHaveBeenCalledWith({ where: { userId: "user-1" } })
  })

  it("is a no-op when no token exists (count 0)", async () => {
    mockGmailDelete.mockResolvedValue({ count: 0 })

    await expect(revokeGmailAccess("user-1")).resolves.not.toThrow()
  })
})
