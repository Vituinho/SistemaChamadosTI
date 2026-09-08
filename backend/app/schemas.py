from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .catalog import CATEGORIES, DEPARTMENTS

Status = Literal["NOVO", "EM_ATENDIMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_TERCEIRO", "RESOLVIDO", "CANCELADO"]
Priority = Literal["BAIXA", "NORMAL", "ALTA", "URGENTE"]


class CleanModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class TicketCreate(CleanModel):
    name: str = Field(min_length=2, max_length=120)
    department: str = Field(max_length=80)
    category: str = Field(max_length=80)
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(default="", max_length=5000)

    @field_validator("description", mode="before")
    @classmethod
    def optional_description(cls, value):
        return "" if value is None else value

    @field_validator("department")
    @classmethod
    def department_valid(cls, value):
        if value not in DEPARTMENTS:
            raise ValueError("Setor inválido")
        return value

    @field_validator("category")
    @classmethod
    def category_valid(cls, value):
        if value not in CATEGORIES:
            raise ValueError("Categoria inválida")
        return value


class TicketUpdate(CleanModel):
    status: Status | None = None
    priority: Priority | None = None


class Resolution(CleanModel):
    solution: str = Field(min_length=3, max_length=3000)


class Login(CleanModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)

    # Preserve spaces in passwords; only names and ticket text are trimmed.
    model_config = ConfigDict(extra="forbid")
