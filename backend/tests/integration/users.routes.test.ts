jest.mock("../../src/config/prisma", () => require("../helpers/prisma-mock"));

import request from "supertest";

import app from "../../src/app";
import { bearer } from "../helpers/auth";
import { prismaMock } from "../helpers/prisma-mock";

const admin = bearer("ADMIN");
const recruiter = bearer("RECRUITER");
const user = {
  id: "u2",
  firstName: "Grace",
  lastName: "Hopper",
  email: "grace@mail.com",
  role: "RECRUITER",
};

beforeEach(() => jest.resetAllMocks());

describe("Contrôle des accès /v1/users (ADMIN uniquement)", () => {
  it("refuse un recruteur (403)", async () => {
    const res = await request(app).get("/v1/users").set("Authorization", recruiter);
    expect(res.status).toBe(403);
  });

  it("refuse un appel anonyme (401)", async () => {
    const res = await request(app).get("/v1/users");
    expect(res.status).toBe(401);
  });
});

describe("CRUD /v1/users", () => {
  it("GET /v1/users renvoie la liste paginée", async () => {
    prismaMock.user.findMany.mockResolvedValue([user]);
    prismaMock.user.count.mockResolvedValue(11);

    const res = await request(app).get("/v1/users?page=2&limit=5").set("Authorization", admin);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 2, limit: 5, total: 11, totalPages: 3 });
  });

  it("GET /v1/users/:id renvoie 404 si inconnu", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/v1/users/inconnu").set("Authorization", admin);
    expect(res.status).toBe(404);
  });

  it("GET /v1/users/:id renvoie l'utilisateur", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    const res = await request(app).get("/v1/users/u2").set("Authorization", admin);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe("u2");
  });

  it("POST /v1/users valide le body (400)", async () => {
    const res = await request(app)
      .post("/v1/users")
      .set("Authorization", admin)
      .send({ firstName: "G", email: "pas-un-email", password: "court" });
    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("POST /v1/users crée l'utilisateur (201)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(user);

    const res = await request(app).post("/v1/users").set("Authorization", admin).send({
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@mail.com",
      password: "Password123!",
    });

    expect(res.status).toBe(201);
  });

  it("POST /v1/users refuse un email déjà utilisé (409)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    const res = await request(app).post("/v1/users").set("Authorization", admin).send({
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@mail.com",
      password: "Password123!",
    });
    expect(res.status).toBe(409);
  });

  it("PUT /v1/users/:id met à jour", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.user.update.mockResolvedValue({ ...user, firstName: "Gracie" });

    const res = await request(app)
      .put("/v1/users/u2")
      .set("Authorization", admin)
      .send({ firstName: "Gracie" });

    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe("Gracie");
  });

  it("DELETE /v1/users/:id supprime", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.user.delete.mockResolvedValue(user);
    const res = await request(app).delete("/v1/users/u2").set("Authorization", admin);
    expect(res.status).toBe(200);
  });
});
