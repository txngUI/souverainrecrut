jest.mock("../../src/config/prisma", () => require("../helpers/prisma-mock"));

import request from "supertest";

import app from "../../src/app";
import { bearer } from "../helpers/auth";
import { prismaMock } from "../helpers/prisma-mock";

const admin = bearer("ADMIN");
const recruiter = bearer("RECRUITER");
const job = {
  id: "j1",
  title: "Développeur Node.js",
  description: "Développement de l'API SouverainRecrut",
  location: "Rennes",
  company: "ACME",
  recruiterId: "u1",
};
const { id: _id, ...payload } = job;

beforeEach(() => jest.resetAllMocks());

describe("/v1/jobs", () => {
  it("GET liste les offres", async () => {
    prismaMock.job.findMany.mockResolvedValue([job]);
    prismaMock.job.count.mockResolvedValue(1);
    const res = await request(app).get("/v1/jobs").set("Authorization", recruiter);
    expect(res.status).toBe(200);
    expect(res.body.data[0].title).toBe(job.title);
  });

  it("GET /:id renvoie 404 si l'offre n'existe pas", async () => {
    prismaMock.job.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/v1/jobs/zz").set("Authorization", recruiter);
    expect(res.status).toBe(404);
  });

  it("GET /:id renvoie l'offre", async () => {
    prismaMock.job.findUnique.mockResolvedValue(job);
    const res = await request(app).get("/v1/jobs/j1").set("Authorization", recruiter);
    expect(res.status).toBe(200);
  });

  it("POST crée une offre (201)", async () => {
    prismaMock.job.create.mockResolvedValue(job);
    const res = await request(app).post("/v1/jobs").set("Authorization", recruiter).send(payload);
    expect(res.status).toBe(201);
  });

  it("POST rejette une offre incomplète (400)", async () => {
    const res = await request(app)
      .post("/v1/jobs")
      .set("Authorization", recruiter)
      .send({ title: "Go" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it("PUT met à jour une offre", async () => {
    prismaMock.job.findUnique.mockResolvedValue(job);
    prismaMock.job.update.mockResolvedValue({ ...job, location: "Paris" });
    const res = await request(app)
      .put("/v1/jobs/j1")
      .set("Authorization", recruiter)
      .send({ location: "Paris" });
    expect(res.status).toBe(200);
    expect(res.body.data.location).toBe("Paris");
  });

  it("DELETE est refusé à un recruteur (403) et autorisé à un ADMIN", async () => {
    prismaMock.job.findUnique.mockResolvedValue(job);
    prismaMock.job.delete.mockResolvedValue(job);

    const denied = await request(app).delete("/v1/jobs/j1").set("Authorization", recruiter);
    const allowed = await request(app).delete("/v1/jobs/j1").set("Authorization", admin);

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
  });
});
