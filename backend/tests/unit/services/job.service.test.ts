jest.mock("../../../src/config/prisma", () => require("../../helpers/prisma-mock"));

import { JobService } from "../../../src/services/job.service";
import { prismaMock } from "../../helpers/prisma-mock";

const service = new JobService();
const job = { id: "j1", title: "Dev Node", recruiterId: "u1" };

beforeEach(() => jest.resetAllMocks());

describe("JobService", () => {
  it("getAll retourne items et total", async () => {
    prismaMock.job.findMany.mockResolvedValue([job]);
    prismaMock.job.count.mockResolvedValue(1);
    await expect(service.getAll()).resolves.toEqual({ items: [job], total: 1 });
  });

  it("getById lève 404 si l'offre n'existe pas", async () => {
    prismaMock.job.findUnique.mockResolvedValue(null);
    await expect(service.getById("nope")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("create délègue au repository", async () => {
    prismaMock.job.create.mockResolvedValue(job);
    const data = {
      title: "Dev Node",
      description: "Une super offre",
      location: "Rennes",
      company: "ACME",
      recruiter: { connect: { id: "u1" } },
    };
    await expect(service.create(data)).resolves.toEqual(job);
  });

  it("update et delete vérifient l'existence", async () => {
    prismaMock.job.findUnique.mockResolvedValue(job);
    prismaMock.job.update.mockResolvedValue(job);
    prismaMock.job.delete.mockResolvedValue(job);

    await expect(service.update("j1", { title: "Dev TS" })).resolves.toEqual(job);
    await expect(service.delete("j1")).resolves.toEqual(job);
  });

  it("update lève 404 sur une offre inexistante", async () => {
    prismaMock.job.findUnique.mockResolvedValue(null);
    await expect(service.update("nope", {})).rejects.toMatchObject({ statusCode: 404 });
  });
});
