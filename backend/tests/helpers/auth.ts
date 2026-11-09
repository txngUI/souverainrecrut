import jwt from "jsonwebtoken";

/**
 * Génère un header Authorization valide pour un rôle donné.
 */
export const bearer = (role: "ADMIN" | "RECRUITER", id = "user-1") =>
  `Bearer ${jwt.sign({ id, role }, process.env.JWT_SECRET as string)}`;
