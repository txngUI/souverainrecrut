jest.mock("../../../src/config/prisma", () => require("../../helpers/prisma-mock"));

import { ApplicationService } from "../../../src/services/application.service";
import { prismaMock } from "../../helpers/prisma-mock";

const service = new ApplicationService();
const application = { id: "a1", candidateId: "c1", jobId: "j1", status: "PENDING" };

beforeEach(() => jest.resetAllMocks());

describe("ApplicationService", () => {
  it("getAll inclut le candidat et l'offre", async () => {
    prismaMock.application.findMany.mockResolvedValue([application]);
    prismaMock.application.count.mockResolvedValue(1);

    await expect(service.getAll()).resolves.toEqual({ items: [application], total: 1 });
    expect(prismaMock.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { candidate: true, job: true } }),
    );
  });

  it("getById lève 404 si la candidature n'existe pas", async () => {
    prismaMock.application.findUnique.mockResolvedValue(null);
    await expect(service.getById("nope")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("create délègue au repository", async () => {
    prismaMock.application.create.mockResolvedValue(application);
    const data = { candidate: { connect: { id: "c1" } }, job: { connect: { id: "j1" } } };
    await expect(service.create(data)).resolves.toEqual(application);
  });

  it("update, updateStatus et delete vérifient l'existence", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);
    prismaMock.application.update.mockResolvedValue({ ...application, status: "ACCEPTED" });
    prismaMock.application.delete.mockResolvedValue(application);

    await expect(service.update("a1", { status: "REVIEWED" })).resolves.toBeDefined();
    await expect(service.updateStatus("a1", "ACCEPTED")).resolves.toMatchObject({
      status: "ACCEPTED",
    });
    expect(prismaMock.application.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "a1" }, data: { status: "ACCEPTED" } }),
    );
    await expect(service.delete("a1")).resolves.toEqual(application);
  });

  it("updateStatus lève 404 sur une candidature inexistante", async () => {
    prismaMock.application.findUnique.mockResolvedValue(null);
    await expect(service.updateStatus("nope", "REJECTED")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prismaMock.application.update).not.toHaveBeenCalled();
  });
});
