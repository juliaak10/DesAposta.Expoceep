import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  getDatabase,
  getCategorias,
  getAssinaturas,
  cadastrarAssinatura,
  getDbInspection,
  cadastrarRespostaPesquisa,
  getEstatisticasPesquisa,
} from './server/db.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middlewares para aceitar JSON e formulários URL-encoded
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Inicializar o banco de dados SQLite na inicialização
  try {
    await getDatabase();
    console.log('✅ Banco de dados SQLite inicializado com sucesso (bd/peticao.db)');
  } catch (err) {
    console.error('❌ Erro ao inicializar SQLite:', err);
  }

  // ========================================================
  // ROTAS DA API
  // ========================================================

  // Rota de status do servidor (Comprovação solicitada na Etapa 1 do Guia CEEP Contra as BETS)
  app.get('/api/status', (req, res) => {
    res.json({
      projeto: 'CEEP Contra as BETS - Petição Pública',
      status: 'API Back-End rodando com sucesso na Etapa 1!',
      versao: '1.0',
      banco_de_dados: 'SQLite (bd/peticao.db)',
      cardinalidade: '1:N (Categorias -> Assinaturas)',
    });
  });

  // Rota para listar as Categorias de Alerta (Tabela 1 - Lado 1 do relacionamento)
  app.get('/api/categorias', async (req, res) => {
    try {
      const categorias = await getCategorias();
      res.json({ categorias });
    } catch (err: any) {
      res.status(500).json({ erro: 'Falha ao buscar categorias', detalhe: err.message });
    }
  });

  // Rota para listar Assinaturas da Petição Pública com estatísticas (Tabela 2 - Lado N)
  app.get('/api/assinaturas', async (req, res) => {
    try {
      const dados = await getAssinaturas();
      res.json(dados);
    } catch (err: any) {
      res.status(500).json({ erro: 'Falha ao buscar assinaturas', detalhe: err.message });
    }
  });

  // Handler reutilizável para inserção de assinaturas
  const handleCadastro = async (req: express.Request, res: express.Response) => {
    try {
      const payload = {
        nome_completo: req.body.nomeCompleto || req.body.nome_completo || req.body.nome || '',
        email: req.body.email || '',
        cpf: req.body.cpf || '',
        categoria_id: req.body.categoria_id || req.body.categoriaId || req.body.categoria || 0,
        comentario: req.body.comentario || '',
      };

      const resultado = await cadastrarAssinatura(payload);

      if (!resultado.sucesso) {
        return res.status(400).json(resultado);
      }

      const dadosAtualizados = await getAssinaturas();
      return res.status(201).json({
        ...resultado,
        totalAtualizado: dadosAtualizados.total,
      });
    } catch (err: any) {
      console.error('Erro na rota de cadastro:', err);
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro interno ao processar a assinatura.',
        detalhe: err?.message,
      });
    }
  };

  // Rota padrão REST
  app.post('/api/assinaturas', handleCadastro);

  // Rota de compatibilidade com salvar.php solicitada no código original e no PDF
  app.post('/salvar.php', handleCadastro);

  // ========================================================
  // ROTAS DA PESQUISA / ENQUETE EXPOCEEP
  // ========================================================
  app.get('/api/pesquisa', async (req, res) => {
    try {
      const stats = await getEstatisticasPesquisa();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ erro: 'Falha ao buscar estatísticas da pesquisa', detalhe: err.message });
    }
  });

  app.post('/api/pesquisa', async (req, res) => {
    try {
      const resultado = await cadastrarRespostaPesquisa({
        faixa_etaria: req.body.faixa_etaria || '',
        contato_apostas: req.body.contato_apostas || '',
        proibicao_suficiente: req.body.proibicao_suficiente || '',
        area_prioritaria: req.body.area_prioritaria || '',
      });

      if (!resultado.sucesso) {
        return res.status(400).json(resultado);
      }

      const statsAtualizadas = await getEstatisticasPesquisa();
      return res.status(201).json({
        ...resultado,
        estatisticas: statsAtualizadas,
      });
    } catch (err: any) {
      return res.status(500).json({
        sucesso: false,
        mensagem: 'Erro interno ao processar a pesquisa.',
        detalhe: err.message,
      });
    }
  });

  // Rota para inspecionar os dados crus do SQLite no frontend (Painel de Banco de Dados)
  app.get('/api/db/inspector', async (req, res) => {
    try {
      const dbData = await getDbInspection();
      const sqlPath = path.join(process.cwd(), 'bd', 'script.sql');
      const scriptSql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf-8') : '';

      res.json({
        tables: dbData,
        scriptSql,
        status: {
          online: true,
          dbEngine: 'SQLite 3 (via WebAssembly Engine)',
          storagePath: 'bd/peticao.db',
          tablesCount: Object.keys(dbData).length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ erro: 'Falha ao inspecionar banco de dados', detalhe: err.message });
    }
  });

  // ========================================================
  // VITE MIDDLEWARE OU ARQUIVOS ESTÁTICOS
  // ========================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor CEEP Contra as BETS rodando na porta ${PORT}`);
  });
}

startServer();
