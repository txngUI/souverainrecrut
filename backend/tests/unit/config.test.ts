jest.mock("../../src/config/prisma", () => require("../helpers/prisma-mock"));

import { ApplicationRepository } from "../../src/repositories/application.repository";
import { CandidateRepository } from "../../src/repositories/candidate.repository";
import { JobRepository } from "../../src/repositories/job.repository";
import { UserRepository } from "../../src/repositories/user.repository";
import { prismaMock } from "../helpers/prisma-mock";

describe("config/env", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("applique les valeurs par défaut quand les variables sont absentes", () => {
    for (const key of [
      "PORT",
      "NODE_ENV",
      "DATABASE_URL",
      "JWT_SECRET",
      "API_VERSION",
      "FRONTEND_URL",
    ]) {
      delete process.env[key];
    }

    jest.isolateModules(() => {
      jest.doMock("dotenv", () => ({ config: jest.fn() }));
      const { env } = require("../../src/config/env");
      expect(env).toEqual({
        port: 4500,
        nodeEnv: "development",
        databaseUrl: "",
        jwtSecret: "",
        apiVersion: "v1",
        frontendUrl: "http://localhost:5173",
      });
    });
  });

  it("utilise le format morgan 'combined' en production", () => {
    process.env.NODE_ENV = "production";

    jest.isolateModules(() => {
      const morgan = jest.fn(() => "middleware");
      jest.doMock("morgan", () => morgan);
      require("../../src/middlewares/logger.middleware");
      expect(morgan).toHaveBeenCalledWith("combined");
    });
  });
});

describe("repositories : pagination par défaut", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    for (const model of [
      prismaMock.user,
      prismaMock.candidate,
      prismaMock.job,
      prismaMock.application,
    ]) {
      model.findMany.mockResolvedValue([]);
      model.count.mockResolvedValue(0);
    }
  });

  it.each([
    ["user", new UserRepository()],
    ["candidate", new CandidateRepository()],
    ["job", new JobRepository()],
    ["application", new ApplicationRepository()],
  ] as const)("%s.findAll() utilise skip=0 et take=10", async (name, repository) => {
    await repository.findAll();
    expect(prismaMock[name].findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
  });
});
