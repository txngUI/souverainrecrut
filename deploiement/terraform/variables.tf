variable "dns_zone" {
  description = "Zone DNS gérée chez Hostinger"
  type        = string
  default     = "tanguydavid.fr"
}

variable "api_subdomain" {
  description = "Sous-domaine exposant l'API SouverainRecrut"
  type        = string
  default     = "api"
}

variable "server_ipv4" {
  description = "Adresse IPv4 publique du serveur de déploiement (VPS)"
  type        = string
  default     = "45.155.170.40"
}

variable "server_ipv6" {
  description = "Adresse IPv6 publique du serveur de déploiement (VPS)"
  type        = string
  default     = "2a09:6382:4000:2:45:155:170:40"
}

variable "ttl" {
  description = "Durée de mise en cache des enregistrements DNS (secondes)"
  type        = number
  default     = 3600
}
