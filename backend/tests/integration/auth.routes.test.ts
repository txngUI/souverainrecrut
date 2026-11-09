jest.mock("../../src/config/prisma", () => require("../helpers/prisma-mock"));

import bcrypt from "bcrypt";
import request from "supertest";

import app from "../../src/app";
import { bearer } from "../helpers/auth";
import { prismaMock } from "../helpers/prisma-mock";

const user = {
  id: "u1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@mail.com",
  password: bcrypt.hashSync("Password123!", 4),
  role: "ADMIN",
};

beforeEach(() => jest.resetAllMocks());

describe("POST /v1/auth/login", () => {
  it("renvoie un token pour des identifiants valides", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: user.email, password: "Password123!" });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("renvoie 401 pour un mauvais mot de passe", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);

    const res = await request(app)
      .post("/v1/auth/login")
      .send({ email: user.email, password: "faux" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Email ou mot de passe invalide.");
  });

  it("renvoie 401 pour un email inconnu", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/v1/auth/login").send({ email: "x@x.fr", password: "x" });
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/auth/me", () => {
  it("renvoie 401 sans token", async () => {
    const res = await request(app).get("/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("renvoie 401 avec un token falsifié", async () => {
    const res = await request(app).get("/v1/auth/me").set("Authorization", "Bearer abc.def.ghi");
    expect(res.status).toBe(401);
  });

  it("renvoie le profil de l'utilisateur connecté", async () => {
    const { password: _password, ...profile } = user;
    prismaMock.user.findUnique.mockResolvedValue(profile);

    const res = await request(app)
      .get("/v1/auth/me")
      .set("Authorization", bearer("RECRUITER", "u1"));

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(user.email);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } }),
    );
  });
});
