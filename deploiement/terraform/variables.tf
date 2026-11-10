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

variable "ci_server_ipv4" {
  description = "Adresse IPv4 publique du serveur d'intégration continue (Jenkins + SonarQube)"
  type        = string
  default     = "185.216.25.110"
}

variable "ci_server_ipv6" {
  description = "Adresse IPv6 publique du serveur d'intégration continue"
  type        = string
  default     = "2a07:abc4::149:91:80:90"
}

variable "ci_subdomains" {
  description = "Sous-domaines exposant les outils de CI"
  type        = set(string)
  default     = ["jenkins", "sonar"]
}
