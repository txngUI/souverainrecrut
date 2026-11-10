# Infrastructure pilotable par Terraform pour ce projet.
#
# Le VPS (PulseHeberg) n'a pas de provider Terraform : il est créé manuellement.
# Terraform décrit la ressource réellement disponible : l'entrée DNS qui rend
# l'API accessible sur https://api.tanguydavid.fr (certificat TLS obtenu par Caddy).
#
# overwrite = false : Terraform n'ajoute que ses propres enregistrements et ne
# remplace aucun enregistrement existant de la zone (sites déjà hébergés).

resource "hostinger_dns_record" "api_ipv4" {
  zone      = var.dns_zone
  name      = var.api_subdomain
  type      = "A"
  value     = var.server_ipv4
  ttl       = var.ttl
  overwrite = false
}

resource "hostinger_dns_record" "api_ipv6" {
  zone      = var.dns_zone
  name      = var.api_subdomain
  type      = "AAAA"
  value     = var.server_ipv6
  ttl       = var.ttl
  overwrite = false
}

# Serveur d'intégration continue (second VPS, séparé de la production) :
# jenkins.tanguydavid.fr et sonar.tanguydavid.fr, en IPv4 et IPv6.
resource "hostinger_dns_record" "ci_ipv4" {
  for_each  = var.ci_subdomains
  zone      = var.dns_zone
  name      = each.value
  type      = "A"
  value     = var.ci_server_ipv4
  ttl       = var.ttl
  overwrite = false
}

resource "hostinger_dns_record" "ci_ipv6" {
  for_each  = var.ci_subdomains
  zone      = var.dns_zone
  name      = each.value
  type      = "AAAA"
  value     = var.ci_server_ipv6
  ttl       = var.ttl
  overwrite = false
}
