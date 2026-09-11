<#
================================================================================
 maj-actualites.ps1 - Mise a jour quotidienne des actualites du jeu
--------------------------------------------------------------------------------
 A LANCER PAR LE PLANIFICATEUR DE TACHES WINDOWS, une fois par jour.

 CE QUE FAIT CE SCRIPT, DANS L'ORDRE :
   1. recupere les actualites officielles (node scripts/fetch-updates.js) ;
   2. si data/updates.json a change, le commit ;
   3. synchronise avec GitHub puis pousse le commit ;
   4. ecrit tout ce qu'il fait dans logs/maj-actualites.log.

 POURQUOI SUR TA MACHINE ET PAS SUR GITHUB ACTIONS :
   www.rocketleague.com bloque les adresses IP des serveurs GitHub. Depuis ta
   connexion personnelle, la requete passe. Les deux autres scripts (compteur
   de membres, boutique) restent sur GitHub Actions, toutes les heures.

 IL NE TOUCHE QU'A data/updates.json : GitHub Actions gere stats.json et
 shop.json de son cote. Les deux automatisations ne se marchent donc jamais
 dessus, meme si elles tournent en meme temps.

 AUCUN MOT DE PASSE ICI : le push utilise les identifiants deja enregistres
 par le Gestionnaire d'identification Windows lors de ton premier push manuel.
================================================================================
#>

# Arrete le script a la premiere erreur non geree.
$ErrorActionPreference = "Stop"

# ==============================================================================
# 1. CONFIGURATION - les seules lignes a adapter si tu deplaces le projet
# ==============================================================================

$ProjetDir = "C:\Users\User\Desktop\dsc\site_rlfr"
$NodeExe   = "C:\Program Files\nodejs\node.exe"
$GitExe    = "C:\Program Files\Git\cmd\git.exe"

$Script    = Join-Path $ProjetDir "scripts\fetch-updates.js"
$Fichier   = "data/updates.json"          # chemin au format Git (avec des /)
$Branche   = "main"

$DossierLogs = Join-Path $ProjetDir "logs"
$FichierLog  = Join-Path $DossierLogs "maj-actualites.log"
$TailleMaxLog = 2MB                        # au-dela, le log est archive

# ==============================================================================
# 2. JOURNALISATION
# ==============================================================================

if (-not (Test-Path $DossierLogs)) {
    New-Item -ItemType Directory -Path $DossierLogs -Force | Out-Null
}

# Si le log devient gros, on l'archive au lieu de le laisser gonfler sans fin.
if ((Test-Path $FichierLog) -and ((Get-Item $FichierLog).Length -gt $TailleMaxLog)) {
    $archive = Join-Path $DossierLogs ("maj-actualites-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
    Move-Item $FichierLog $archive -Force
}

function Ecrire-Log {
    param([string]$Message, [string]$Niveau = "INFO")
    $ligne = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Niveau, $Message
    Add-Content -Path $FichierLog -Value $ligne -Encoding utf8
    Write-Output $ligne
}

function Invoke-Externe {
    <#
      Execute un programme externe et renvoie sa sortie complete + son code.

      PIEGE POWERSHELL IMPORTANT, NE PAS SIMPLIFIER :
      avec $ErrorActionPreference = "Stop", rediriger la sortie d'erreur d'un
      programme externe (2>&1) transforme CHAQUE ligne de stderr en erreur
      bloquante. Or git ecrit ses messages d'information normaux sur stderr
      ("From https://github.com/...", "Everything up-to-date"), et node y
      ecrit ses avertissements. Sans la neutralisation ci-dessous, le script
      s'arretait en croyant a un echec alors que tout allait bien.

      On repasse donc temporairement en "Continue" pendant l'appel, et on se
      fie UNIQUEMENT au code de sortie du programme pour juger du resultat.
    #>
    param(
        [string]   $Programme,
        [string[]] $Arguments
    )

    $ancienneValeur = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $sortie = & $Programme @Arguments 2>&1 | Out-String
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $ancienneValeur
    }

    return [PSCustomObject]@{
        Code   = $code
        Sortie = $sortie.Trim()
    }
}

function Lancer-Git {
    param([string[]]$Arguments)
    return Invoke-Externe -Programme $GitExe -Arguments $Arguments
}

# ==============================================================================
# 3. EXECUTION
# ==============================================================================

$codeSortie = 0

try {
    Ecrire-Log "================ Demarrage ================"

    # --- Verifications prealables : on echoue tot, avec un message clair -------
    foreach ($chemin in @($ProjetDir, $NodeExe, $GitExe, $Script)) {
        if (-not (Test-Path $chemin)) {
            throw "Introuvable : $chemin (verifie la section CONFIGURATION en haut de ce script)"
        }
    }

    Set-Location $ProjetDir

    # --- Etape 1 : recuperation des actualites --------------------------------
    Ecrire-Log "Recuperation des actualites officielles..."

    # Meme precaution que pour git : le script Node ecrit ses avertissements
    # sur stderr, ce qui ferait planter PowerShell sans Invoke-Externe.
    $node = Invoke-Externe -Programme $NodeExe -Arguments @($Script)

    # On recopie la sortie du script Node dans le log, ligne par ligne :
    # c'est elle qui contient le diagnostic en cas de blocage anti-robot.
    foreach ($ligne in ($node.Sortie -split "`r?`n")) {
        if ($ligne.Trim()) { Ecrire-Log "    $ligne" }
    }

    if ($node.Code -ne 0) {
        # Le script Node protege deja data/updates.json : rien n'a ete ecrase.
        throw "Le script de recuperation a echoue (code $($node.Code)). data/updates.json n'a PAS ete modifie, le site garde ses dernieres actualites valides."
    }

    # --- Etape 2 : le fichier a-t-il change ? ---------------------------------
    $etat = Lancer-Git @("status", "--porcelain", "--", $Fichier)

    if (-not $etat.Sortie) {
        Ecrire-Log "Aucune nouvelle actualite : $Fichier est inchange, rien a publier."
        Ecrire-Log "================ Termine (aucun changement) ================"
        exit 0
    }

    Ecrire-Log "Changement detecte dans $Fichier."

    # --- Etape 3 : commit -----------------------------------------------------
    # On ne stage QUE ce fichier : si stats.json ou shop.json ont ete modifies
    # localement (test manuel), ils ne partent pas dans ce commit et ne
    # risquent pas d'entrer en conflit avec ceux de GitHub Actions.
    $add = Lancer-Git @("add", "--", $Fichier)
    if ($add.Code -ne 0) { throw "git add a echoue : $($add.Sortie)" }

    $horodatage = Get-Date -Format "yyyy-MM-dd"
    $commit = Lancer-Git @("commit", "-m", "chore(data): actualites du jeu au $horodatage")
    if ($commit.Code -ne 0) { throw "git commit a echoue : $($commit.Sortie)" }
    Ecrire-Log "Commit cree."

    # --- Etape 4 : synchronisation avec GitHub --------------------------------
    # GitHub Actions pousse ses propres commits toutes les heures : il faut
    # donc rejouer le notre par-dessus avant de pousser, sinon le push est
    # refuse. --autostash met de cote d'eventuelles modifications en cours.
    Ecrire-Log "Synchronisation avec GitHub (git pull --rebase)..."
    $pull = Lancer-Git @("pull", "--rebase", "--autostash", "origin", $Branche)

    if ($pull.Code -ne 0) {
        # Cas rare : les deux cotes ont modifie le meme fichier. On annule le
        # rebase pour laisser le depot dans un etat sain et exploitable.
        Ecrire-Log "Le rebase a echoue, annulation pour ne pas laisser le depot a moitie fusionne." "ERREUR"
        Lancer-Git @("rebase", "--abort") | Out-Null
        throw "Conflit lors de la synchronisation : $($pull.Sortie)`n           Ton commit local est conserve. Ouvre un terminal dans le projet et lance : git pull --rebase origin $Branche"
    }

    # --- Etape 5 : push -------------------------------------------------------
    Ecrire-Log "Envoi vers GitHub..."
    $push = Lancer-Git @("push", "origin", "HEAD:$Branche")

    if ($push.Code -ne 0) {
        throw "git push a echoue : $($push.Sortie)`n           Cause frequente : identifiants GitHub expires. Ouvre un terminal dans le projet et lance un 'git push' a la main une fois, pour que Windows reenregistre tes identifiants."
    }

    Ecrire-Log "Actualites publiees sur GitHub."
    Ecrire-Log "================ Termine (succes) ================"
}
catch {
    Ecrire-Log $_.Exception.Message "ERREUR"
    Ecrire-Log "================ Termine (echec) ================"
    $codeSortie = 1
}

# Le code de sortie est lu par le Planificateur de taches : 0 = succes,
# 1 = echec (visible dans la colonne "Resultat de la derniere execution").
exit $codeSortie
