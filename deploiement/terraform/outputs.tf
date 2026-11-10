output "api_fqdn" {
  description = "Nom de domaine complet de l'API"
  value       = "${var.api_subdomain}.${var.dns_zone}"
}

output "api_url" {
  description = "URL publique de l'API"
  value       = "https://${var.api_subdomain}.${var.dns_zone}/v1/health"
}

output "dns_records" {
  description = "Enregistrements DNS gérés par Terraform"
  value = {
    A    = hostinger_dns_record.api_ipv4.value
    AAAA = hostinger_dns_record.api_ipv6.value
  }
}

output "ci_urls" {
  description = "URL publiques des outils de CI"
  value       = { for s in var.ci_subdomains : s => "https://${s}.${var.dns_zone}" }
}
