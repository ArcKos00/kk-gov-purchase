# kk-gov-purchase

**Облік закупівель** — вебзастосунок для обліку договорів, найменувань і поставок
(NestJS + React + PostgreSQL).

Увесь код — у каталозі [`purchase/`](purchase/): опис, запуск, змінні середовища і тести —
у [`purchase/README.md`](purchase/README.md).

| Що | Де |
|---|---|
| Застосунок (npm-воркспейси: `apps/api`, `apps/web`, `packages/shared`) | `purchase/` |
| Docker-образ (контекст збірки — `purchase/`) | `purchase/Dockerfile` |
| Kubernetes (Deployment, Service, Ingress, ConfigMap, PVC) | `purchase/deploy.yaml` |
| Локальний запуск з PostgreSQL | `purchase/docker-compose.yml` |

Кожен push у `main` автоматично збирається Jenkins і розгортається в продакшен — працюйте в гілках і через Pull Request.
