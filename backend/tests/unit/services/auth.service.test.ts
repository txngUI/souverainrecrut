jest.mock("../../../src/config/prisma", () => require("../../helpers/prisma-mock"));

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { AuthService } from "../../../src/services/auth.service";
import { prismaMock } from "../../helpers/prisma-mock";

const service = new AuthService();
const password = "Password123!";
const user = {
  id: "u1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@mail.com",
  password: bcrypt.hashSync(password, 4),
  role: "ADMIN",
};

beforeEach(() => jest.resetAllMocks());

describe("AuthService.login", () => {
  it("refuse un email inconnu (401)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.login("x@mail.com", password)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("refuse un mauvais mot de passe (401)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    await expect(service.login(user.email, "mauvais")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("retourne un JWT valide et l'utilisateur sans son mot de passe", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);

    const result = await service.login(user.email, password);

    expect(result.user).not.toHaveProperty("password");
    expect(result.user.email).toBe(user.email);
    expect(jwt.verify(result.token, "test-secret")).toMatchObject({ id: "u1", role: "ADMIN" });
  });
});
