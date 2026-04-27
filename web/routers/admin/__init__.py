from fastapi import APIRouter
from .auth import router as auth_router
from .dashboard import router as dashboard_router
from .branding import router as branding_router
from .features import router as features_router
from .plans import router as plans_router
from .payment_providers import router as payment_providers_router
from .users import router as users_router

admin_router = APIRouter(prefix="/admin", tags=["admin"])
admin_router.include_router(auth_router)
admin_router.include_router(dashboard_router)
admin_router.include_router(branding_router)
admin_router.include_router(features_router)
admin_router.include_router(plans_router)
admin_router.include_router(payment_providers_router)
admin_router.include_router(users_router)
