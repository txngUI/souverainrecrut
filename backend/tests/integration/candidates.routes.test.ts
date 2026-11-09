jest.mock("../../src/config/prisma", () => require("../helpers/prisma-mock"));

import request from "supertest";

import app from "../../src/app";
import { bearer } from "../helpers/auth";
import { prismaMock } from "../helpers/prisma-mock";

const admin = bearer("ADMIN");
const recruiter = bearer("RECRUITER");
const candidate = { id: "c1", fullName: "Jean Dupont", email: "jean@mail.com", phone: null };

beforeEach(() => jest.resetAllMocks());

describe("/v1/candidates", () => {
  it("GET liste accessible à un recruteur", async () => {
    prismaMock.candidate.findMany.mockResolvedValue([candidate]);
    prismaMock.candidate.count.mockResolvedValue(1);

    const res = await request(app).get("/v1/candidates").set("Authorization", recruiter);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it("GET liste refusée sans token (401)", async () => {
    const res = await request(app).get("/v1/candidates");
    expect(res.status).toBe(401);
  });

  it("GET /:id renvoie le candidat ou 404", async () => {
    prismaMock.candidate.findUnique.mockResolvedValueOnce(candidate).mockResolvedValueOnce(null);

    const found = await request(app).get("/v1/candidates/c1").set("Authorization", recruiter);
    const missing = await request(app).get("/v1/candidates/zz").set("Authorization", recruiter);

    expect(found.status).toBe(200);
    expect(missing.status).toBe(404);
  });

  it("POST crée un candidat en normalisant l'email (201)", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(null);
    prismaMock.candidate.create.mockResolvedValue(candidate);

    const res = await request(app)
      .post("/v1/candidates")
      .set("Authorization", recruiter)
      .send({ fullName: "Jean Dupont", email: "JEAN@MAIL.COM" });

    expect(res.status).toBe(201);
    expect(prismaMock.candidate.create).toHaveBeenCalledWith({
      data: { fullName: "Jean Dupont", email: "jean@mail.com" },
    });
  });

  it("POST rejette un body invalide (400)", async () => {
    const res = await request(app)
      .post("/v1/candidates")
      .set("Authorization", recruiter)
      .send({ fullName: "J", email: "nope" });
    expect(res.status).toBe(400);
  });

  it("POST refuse un doublon d'email (409)", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(candidate);
    const res = await request(app)
      .post("/v1/candidates")
      .set("Authorization", recruiter)
      .send({ fullName: "Jean Dupont", email: "jean@mail.com" });
    expect(res.status).toBe(409);
  });

  it("PUT met à jour un candidat", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(candidate);
    prismaMock.candidate.update.mockResolvedValue({ ...candidate, phone: "0601020304" });

    const res = await request(app)
      .put("/v1/candidates/c1")
      .set("Authorization", recruiter)
      .send({ phone: "0601020304" });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe("0601020304");
  });

  it("DELETE est réservé aux ADMIN (403 pour un recruteur)", async () => {
    const res = await request(app).delete("/v1/candidates/c1").set("Authorization", recruiter);
    expect(res.status).toBe(403);
    expect(prismaMock.candidate.delete).not.toHaveBeenCalled();
  });

  it("DELETE par un ADMIN supprime le candidat", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue(candidate);
    prismaMock.candidate.delete.mockResolvedValue(candidate);
    const res = await request(app).delete("/v1/candidates/c1").set("Authorization", admin);
    expect(res.status).toBe(200);
  });
});
