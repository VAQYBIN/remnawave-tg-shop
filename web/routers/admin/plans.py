from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Account
from web.dependencies import get_db, get_current_admin
from web.schemas.admin.plans import PlanResponse, PlanCreateRequest, PlanUpdateRequest, PlansListResponse
from core.dal.pricing_plan_dal import (
    get_all_plans, get_plan_by_id, create_plan, update_plan, delete_plan
)

router = APIRouter()


@router.get("/plans", response_model=PlansListResponse)
async def list_plans(
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    plans = await get_all_plans(db)
    return PlansListResponse(
        items=[PlanResponse.model_validate(p) for p in plans],
        total=len(plans),
    )


@router.post("/plans", response_model=PlanResponse, status_code=201)
async def create_new_plan(
    body: PlanCreateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    plan = await create_plan(db, **body.model_dump())
    await db.commit()
    return PlanResponse.model_validate(plan)


@router.patch("/plans/{plan_id}", response_model=PlanResponse)
async def update_existing_plan(
    plan_id: int,
    body: PlanUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    updates = body.model_dump(exclude_none=True)
    plan = await update_plan(db, plan_id, **updates)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    await db.commit()
    return PlanResponse.model_validate(plan)


@router.delete("/plans/{plan_id}", status_code=204)
async def delete_existing_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: Account = Depends(get_current_admin),
):
    deleted = await delete_plan(db, plan_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Plan not found")
    await db.commit()
