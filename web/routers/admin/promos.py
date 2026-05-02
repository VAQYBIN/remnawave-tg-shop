from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Account
from web.dependencies import get_db, get_current_admin
from web.schemas.admin.promos import (
    AdminPromoItem,
    AdminPromoListResponse,
    PromoCreateRequest,
    PromoUpdateRequest,
)
from core.dal.promo_code_dal import (
    create_promo_code,
    delete_promo_code,
    get_all_promo_codes_with_details,
    get_promo_code_by_code,
    get_promo_code_by_id,
    get_promo_codes_count,
    update_promo_code,
)

router = APIRouter()


def _to_item(p) -> AdminPromoItem:
    return AdminPromoItem(
        promo_code_id=p.promo_code_id,
        code=p.code,
        promo_type=p.promo_type,
        bonus_days=p.bonus_days,
        discount_percentage=p.discount_percentage,
        max_activations=p.max_activations,
        current_activations=p.current_activations,
        is_active=p.is_active,
        created_at=p.created_at,
        valid_until=p.valid_until,
    )


@router.get("/promos", response_model=AdminPromoListResponse)
async def list_promos(
    page: int = Query(0, ge=0),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    promos = await get_all_promo_codes_with_details(db, limit=page_size, offset=page * page_size)
    total = await get_promo_codes_count(db)
    return AdminPromoListResponse(
        items=[_to_item(p) for p in promos],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/promos", response_model=AdminPromoItem)
async def create_promo(
    body: PromoCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin: Account = Depends(get_current_admin),
):
    if await get_promo_code_by_code(db, body.code):
        raise HTTPException(status_code=409, detail="Promo code already exists")

    if body.promo_type == "bonus_days" and not body.bonus_days:
        raise HTTPException(status_code=422, detail="bonus_days is required for type 'bonus_days'")
    if body.promo_type == "discount" and not body.discount_percentage:
        raise HTTPException(status_code=422, detail="discount_percentage is required for type 'discount'")

    promo_data = {
        "code": body.code.upper().strip(),
        "promo_type": body.promo_type,
        "bonus_days": body.bonus_days if body.promo_type == "bonus_days" else None,
        "discount_percentage": body.discount_percentage if body.promo_type == "discount" else None,
        "max_activations": body.max_activations,
        "valid_until": body.valid_until,
        "is_active": True,
        "current_activations": 0,
        "created_by_admin_id": admin.telegram_user_id or 0,
    }

    promo = await create_promo_code(db, promo_data)
    await db.commit()
    return _to_item(promo)


@router.patch("/promos/{promo_id}", response_model=AdminPromoItem)
async def update_promo(
    promo_id: int,
    body: PromoUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    promo = await get_promo_code_by_id(db, promo_id)
    if not promo:
        raise HTTPException(status_code=404, detail="Promo code not found")

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        return _to_item(promo)

    updated = await update_promo_code(db, promo_id, update_data)
    await db.commit()
    return _to_item(updated)


@router.delete("/promos/{promo_id}")
async def remove_promo(
    promo_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    if not await get_promo_code_by_id(db, promo_id):
        raise HTTPException(status_code=404, detail="Promo code not found")

    await delete_promo_code(db, promo_id)
    await db.commit()
    return {"ok": True}
