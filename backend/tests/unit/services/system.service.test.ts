jest.mock("../../../src/config/prisma", () => require("../../helpers/prisma-mock"));

import { DashboardService } from "../../../src/services/dashboard.service";
import { HealthService } from "../../../src/services/health.service";
import { InfoService } from "../../../src/services/info.service";
import { prismaMock } from "../../helpers/prisma-mock";

beforeEach(() => jest.resetAllMocks());

describe("HealthService", () => {
  const service = new HealthService();

  it("health retourne UP", async () => {
    await expect(service.health()).resolves.toMatchObject({ status: "UP", environment: "test" });
  });

  it("readiness retourne READY quand la base répond", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    await expect(service.readiness()).resolves.toMatchObject({
      status: "READY",
      database: "CONNECTED",
    });
  });

  it("readiness retourne NOT_READY quand la base est injoignable", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(service.readiness()).resolves.toMatchObject({
      status: "NOT_READY",
      database: "DISCONNECTED",
    });
  });
});

describe("InfoService", () => {
  it("retourne les informations de l'API", () => {
    expect(new InfoService().getInfo()).toMatchObject({
      name: "SouverainRecrut API",
      apiVersion: "v1",
      health: "/v1/health",
    });
  });
});

describe("DashboardService", () => {
  it("agrège les compteurs", async () => {
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.candidate.count.mockResolvedValue(5);
    prismaMock.job.count.mockResolvedValue(3);
    prismaMock.application.count.mockResolvedValueOnce(8).mockResolvedValueOnce(4);

    await expect(new DashboardService().getStatistics()).resolves.toEqual({
      users: 2,
      candidates: 5,
      jobs: 3,
      applications: 8,
      pendingApplications: 4,
    });
    expect(prismaMock.application.count).toHaveBeenCalledWith({ where: { status: "PENDING" } });
  });
});
