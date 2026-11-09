terraform {
  required_version = ">= 1.6"

  required_providers {
    hostinger = {
      source  = "hostinger/hostinger"
      version = "~> 0.1"
    }
  }
}

# Le token API est lu dans la variable d'environnement HOSTINGER_API_TOKEN :
# aucun secret dans le code ni dans les fichiers de variables.
provider "hostinger" {}
