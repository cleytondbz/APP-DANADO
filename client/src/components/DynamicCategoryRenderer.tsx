import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { motion } from 'framer-motion';

export interface Produto {
  id: string;
  descricao: string;
  quantidade: number;
  valor: number;
  hora: string;
}

interface DynamicCategoryRendererProps {
  categoryId: string;
  categoryName: string;
  colorClass: string;
  borderColorClass: string;
  icon: React.ReactNode;
  descricao: string;
  setDescricao: (v: string) => void;
  quantidade: string;
  setQuantidade: (v: string) => void;
  valor: string;
  setValor: (v: string) => void;
  produtos: Produto[];
  total: number;
  onAdicionarProduto: () => void;
  onEditarProduto: (id: string) => void;
  onExcluirProduto: (id: string) => void;
  formatCurrency: (value: number) => string;
  formatarHora: (hora: string) => string;
  delay?: number;
}

export const DynamicCategoryRenderer: React.FC<DynamicCategoryRendererProps> = ({
  categoryId,
  categoryName,
  colorClass,
  borderColorClass,
  icon,
  descricao,
  setDescricao,
  quantidade,
  setQuantidade,
  valor,
  setValor,
  produtos,
  total,
  onAdicionarProduto,
  onEditarProduto,
  onExcluirProduto,
  formatCurrency,
  formatarHora,
  delay = 0,
}) => {
  const handleNumberInput = (value: string): string => {
    return value.replace(/[^0-9,]/g, '');
  };

  const parseCommaNumber = (value: string | number): number => {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    return parseFloat(value.toString().replace(',', '.')) || 0;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className={`p-4 border-l-4 ${borderColorClass}`}>
        <h3 className={`text-lg font-bold ${colorClass} mb-4`}>{categoryName}</h3>

        {/* Formulário */}
        <div className="space-y-3 mb-4 pb-4 border-b border-border">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">
              Descrição <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Venda"
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Qtd</label>
              <Input
                type="text"
                value={quantidade}
                onChange={e => setQuantidade(handleNumberInput(e.target.value))}
                placeholder="1"
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Valor</label>
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold">R$</span>
                <Input
                  type="text"
                  value={valor}
                  onChange={e => setValor(handleNumberInput(e.target.value))}
                  placeholder="0,00"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <Button onClick={onAdicionarProduto} size="sm" className="w-full gap-2">
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        </div>

        {/* Total */}
        <div className="mb-4 p-3 bg-secondary/50 rounded-lg">
          <p className="text-xs text-muted-foreground uppercase">Total</p>
          <p className="text-2xl font-bold text-amber-600">{formatCurrency(total)}</p>
        </div>

        {/* Produtos */}
        <div className="space-y-2">
          {produtos.map(produto => (
            <div key={produto.id} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{produto.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  {produto.quantidade}x {parseCommaNumber(produto.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = 
                  <span className="text-amber-600 font-bold ml-1">{formatCurrency(produto.valor * produto.quantidade)}</span>
                  <span className="text-muted-foreground ml-2">{formatarHora(produto.hora)}</span>
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => onEditarProduto(produto.id)}
                  className="p-1 hover:bg-blue-500/20 rounded transition-colors"
                >
                  <Edit2 className="w-4 h-4 text-blue-500" />
                </button>
                <button
                  onClick={() => onExcluirProduto(produto.id)}
                  className="p-1 hover:bg-red-500/20 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
};
