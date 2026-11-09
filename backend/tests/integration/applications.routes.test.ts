jest.mock("../../src/config/prisma", () => require("../helpers/prisma-mock"));

import request from "supertest";

import app from "../../src/app";
import { bearer } from "../helpers/auth";
import { prismaMock } from "../helpers/prisma-mock";

const admin = bearer("ADMIN");
const recruiter = bearer("RECRUITER");
const application = { id: "a1", candidateId: "c1", jobId: "j1", status: "PENDING" };

beforeEach(() => jest.resetAllMocks());

describe("/v1/applications", () => {
  it("GET liste les candidatures", async () => {
    prismaMock.application.findMany.mockResolvedValue([application]);
    prismaMock.application.count.mockResolvedValue(1);
    const res = await request(app).get("/v1/applications").set("Authorization", recruiter);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("GET /:id renvoie la candidature ou 404", async () => {
    prismaMock.application.findUnique
      .mockResolvedValueOnce(application)
      .mockResolvedValueOnce(null);
    const found = await request(app).get("/v1/applications/a1").set("Authorization", recruiter);
    const missing = await request(app).get("/v1/applications/zz").set("Authorization", recruiter);
    expect(found.status).toBe(200);
    expect(missing.status).toBe(404);
  });

  it("POST crée une candidature (201)", async () => {
    prismaMock.application.create.mockResolvedValue(application);
    const res = await request(app)
      .post("/v1/applications")
      .set("Authorization", recruiter)
      .send({ candidateId: "c1", jobId: "j1" });
    expect(res.status).toBe(201);
  });

  it("POST rejette un statut inconnu (400)", async () => {
    const res = await request(app)
      .post("/v1/applications")
      .set("Authorization", recruiter)
      .send({ candidateId: "c1", jobId: "j1", status: "MAYBE" });
    expect(res.status).toBe(400);
  });

  it("PUT change le statut", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);
    prismaMock.application.update.mockResolvedValue({ ...application, status: "ACCEPTED" });
    const res = await request(app)
      .put("/v1/applications/a1")
      .set("Authorization", recruiter)
      .send({ status: "ACCEPTED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ACCEPTED");
  });

  it("DELETE est réservé aux ADMIN", async () => {
    prismaMock.application.findUnique.mockResolvedValue(application);
    prismaMock.application.delete.mockResolvedValue(application);

    const denied = await request(app).delete("/v1/applications/a1").set("Authorization", recruiter);
    const allowed = await request(app).delete("/v1/applications/a1").set("Authorization", admin);

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
  });
});

describe("/v1/dashboard/stats", () => {
  it("renvoie les statistiques à un utilisateur connecté", async () => {
    prismaMock.user.count.mockResolvedValue(1);
    prismaMock.candidate.count.mockResolvedValue(2);
    prismaMock.job.count.mockResolvedValue(3);
    prismaMock.application.count.mockResolvedValue(4);

    const res = await request(app).get("/v1/dashboard/stats").set("Authorization", recruiter);

    expect(res.status).toBe(200);
    expect(res.body.data.jobs).toBe(3);
  });

  it("est refusé sans token (401)", async () => {
    const res = await request(app).get("/v1/dashboard/stats");
    expect(res.status).toBe(401);
  });
});
