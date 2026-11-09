jest.mock("../../../src/config/prisma", () => require("../../helpers/prisma-mock"));

import { CandidateService } from "../../../src/services/candidate.service";
import { prismaMock } from "../../helpers/prisma-mock";

const service = new CandidateService();
const candidate = { id: "c1", fullName: "Jean Dupont", email: "jean@mail.com" };

beforeEach(() => jest.resetAllMocks());

describe("CandidateService", () => {
  it("getAll retourne items et total", async () => {
    prismaMock.candidate.findMany.mockResolvedValue([candidate]);
    prismaMock.candidate.count.mockResolvedValue(1);
    await expect(service.getAll()).resolves.toEqual({ items: [candidate], total: 1 });
  });

  it("getById lève 404 si le candidat n'existe pas", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(null);
    await expect(service.getById("nope")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("create refuse un email déjà existant (409)", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(candidate);
    await expect(service.create(candidate)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.candidate.create).not.toHaveBeenCalled();
  });

  it("create enregistre un nouveau candidat", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(null);
    prismaMock.candidate.create.mockResolvedValue(candidate);
    await expect(service.create(candidate)).resolves.toEqual(candidate);
  });

  it("update et delete vérifient l'existence", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(candidate);
    prismaMock.candidate.update.mockResolvedValue(candidate);
    prismaMock.candidate.delete.mockResolvedValue(candidate);

    await expect(service.update("c1", { phone: "0600000000" })).resolves.toEqual(candidate);
    await expect(service.delete("c1")).resolves.toEqual(candidate);
  });

  it("delete lève 404 sur un candidat inexistant", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(null);
    await expect(service.delete("nope")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.candidate.delete).not.toHaveBeenCalled();
  });
});
