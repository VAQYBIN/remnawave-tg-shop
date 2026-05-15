from fastapi import APIRouter
from .auth import router as auth_router
from .dashboard import router as dashboard_router
from .branding import router as branding_router
from .features import router as features_router
from .plans import router as plans_router
from .payment_providers import router as payment_providers_router
from .users import router as users_router
from .payments import router as payments_router
from .promos import router as promos_router
from .broadcast import router as broadcast_router
from .panel_stats import router as panel_stats_router
from .panel_nodes import router as panel_nodes_router
from .panel_users import router as panel_users_router
from .remnawave import router as remnawave_router

admin_router = APIRouter(prefix="/admin", tags=["admin"])
admin_router.include_router(auth_router)
admin_router.include_router(dashboard_router)
admin_router.include_router(branding_router)
admin_router.include_router(features_router)
admin_router.include_router(plans_router)
admin_router.include_router(payment_providers_router)
admin_router.include_router(users_router)
admin_router.include_router(payments_router)
admin_router.include_router(promos_router)
admin_router.include_router(broadcast_router)
admin_router.include_router(panel_stats_router)
admin_router.include_router(panel_nodes_router)
admin_router.include_router(panel_users_router)
admin_router.include_router(remnawave_router)
